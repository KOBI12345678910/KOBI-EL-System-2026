import { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Plus, Search, Eye, Edit2, Trash2, ChevronRight, ChevronLeft,
  X, Save, AlertCircle, CheckCircle2, Clock, Loader2, MessageSquare,
  User, Package, AlertTriangle, TrendingUp
} from "lucide-react";
import { authFetch } from "@/lib/utils";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";

const BASE = "/api/qms";

const STATUSES = ["received", "investigating", "resolved", "closed"] as const;
const STATUS_HE: Record<string, string> = {
  received: "התקבלה", investigating: "בחקירה", resolved: "נפתרה", closed: "סגורה"
};
const STATUS_COLOR: Record<string, string> = {
  received: "bg-blue-500/20 text-blue-300",
  investigating: "bg-yellow-500/20 text-yellow-300",
  resolved: "bg-green-500/20 text-green-300",
  closed: "bg-gray-500/20 text-gray-300"
};
const SEV_HE: Record<string, string> = { low: "נמוכה", medium: "בינונית", high: "גבוהה", critical: "קריטי" };
const SEV_COLOR: Record<string, string> = {
  low: "bg-green-500/20 text-green-300", medium: "bg-yellow-500/20 text-yellow-300",
  high: "bg-orange-500/20 text-orange-300", critical: "bg-red-500/20 text-red-300"
};
const SLA_COLOR: Record<string, string> = { overdue: "text-red-400", warning: "text-orange-400", ok: "text-green-400" };
const SLA_HE: Record<string, string> = { overdue: "באיחור", warning: "קרוב לחריגה", ok: "בזמן" };

const LIFECYCLE = ["received", "investigating", "resolved", "closed"];

function SlaIndicator({ sla_status, target_date }: { sla_status: string; target_date: string }) {
  return (
    <div className={`flex items-center gap-1 text-xs ${SLA_COLOR[sla_status] || "text-muted-foreground"}`}>
      <Clock className="w-3 h-3" />
      <span>{SLA_HE[sla_status] || "בזמן"}</span>
      {target_date && <span className="text-muted-foreground">| יעד: {target_date?.slice(0, 10)}</span>}
    </div>
  );
}

function ComplaintForm({ initial, onSave, onClose, ncrList }: { initial?: any; onSave: () => void; onClose: () => void; ncrList: any[] }) {
  const [form, setForm] = useState(initial || {
    customer_name: "", customer_reference: "", product_name: "", product_code: "",
    batch_reference: "", complaint_type: "quality", severity: "medium",
    description: "", received_date: new Date().toISOString().slice(0, 10),
    sla_days: 10, status: "received", assigned_to: "", linked_ncr_id: ""
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const validation = useFormValidation({
    customer_name: { required: true, message: "שם לקוח חובה" },
    description: { required: true, message: "תיאור התלונה חובה" },
  });

  const f = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));

  const save = async () => {
    if (!validation.validate(form)) return;
    setSaving(true); setError("");
    try {
      const url = initial ? `${BASE}/complaints/${initial.id}` : `${BASE}/complaints`;
      const r = await authFetch(url, { method: initial ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!r.ok) throw new Error("שגיאה בשמירה");
      onSave();
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2"><MessageSquare className="w-5 h-5 text-orange-400" />{initial ? "עריכת תלונה" : "תלונת לקוח חדשה"}</h2>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-5">
          {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-300 text-sm">{error}</div>}
          <div>
            <h3 className="text-sm font-semibold text-orange-400 mb-3">פרטי לקוח ומוצר</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">שם לקוח <RequiredMark /></Label>
                <Input value={form.customer_name || ""} onChange={e => f("customer_name", e.target.value)} className={`mt-1 bg-background border-border ${validation.getFieldProps("customer_name").className}`} />
                <FormFieldError error={validation.errors.customer_name} />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">אסמכתא לקוח</Label>
                <Input value={form.customer_reference || ""} onChange={e => f("customer_reference", e.target.value)} className="mt-1 bg-background border-border" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">שם מוצר</Label>
                <Input value={form.product_name || ""} onChange={e => f("product_name", e.target.value)} className="mt-1 bg-background border-border" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">קוד מוצר</Label>
                <Input value={form.product_code || ""} onChange={e => f("product_code", e.target.value)} className="mt-1 bg-background border-border" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">מספר אצווה</Label>
                <Input value={form.batch_reference || ""} onChange={e => f("batch_reference", e.target.value)} className="mt-1 bg-background border-border" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">סוג תלונה</Label>
                <select value={form.complaint_type || "quality"} onChange={e => f("complaint_type", e.target.value)} className="w-full mt-1 bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                  <option value="quality">איכות</option>
                  <option value="delivery">אספקה</option>
                  <option value="service">שירות</option>
                  <option value="safety">בטיחות</option>
                  <option value="other">אחר</option>
                </select>
              </div>
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-orange-400 mb-3">פרטי תלונה</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label className="text-xs text-muted-foreground">תיאור תלונה <RequiredMark /></Label>
                <textarea value={form.description || ""} onChange={e => f("description", e.target.value)} rows={3} className={`w-full mt-1 bg-background border rounded-xl px-3 py-2.5 text-sm resize-none ${validation.getFieldProps("description").className || "border-border"}`} />
                <FormFieldError error={validation.errors.description} />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">חומרה</Label>
                <select value={form.severity || "medium"} onChange={e => f("severity", e.target.value)} className="w-full mt-1 bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                  <option value="low">נמוכה</option>
                  <option value="medium">בינונית</option>
                  <option value="high">גבוהה</option>
                  <option value="critical">קריטי</option>
                </select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">תאריך קבלה</Label>
                <Input type="date" value={form.received_date || ""} onChange={e => f("received_date", e.target.value)} className="mt-1 bg-background border-border" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">SLA (ימים)</Label>
                <Input type="number" value={form.sla_days || 10} onChange={e => f("sla_days", e.target.value)} className="mt-1 bg-background border-border" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">אחראי טיפול</Label>
                <Input value={form.assigned_to || ""} onChange={e => f("assigned_to", e.target.value)} className="mt-1 bg-background border-border" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">סטטוס</Label>
                <select value={form.status || "received"} onChange={e => f("status", e.target.value)} className="w-full mt-1 bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                  {STATUSES.map(s => <option key={s} value={s}>{STATUS_HE[s]}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">NCR מקושר</Label>
                <select value={form.linked_ncr_id || ""} onChange={e => f("linked_ncr_id", e.target.value)} className="w-full mt-1 bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                  <option value="">ללא</option>
                  {ncrList.map((n: any) => <option key={n.id} value={n.id}>{n.ncr_number} — {n.title?.slice(0, 35)}</option>)}
                </select>
              </div>
            </div>
          </div>
          {initial && (
            <div>
              <h3 className="text-sm font-semibold text-orange-400 mb-3">פתרון ומעקב</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label className="text-xs text-muted-foreground">סיכום חקירה</Label>
                  <textarea value={form.investigation_summary || ""} onChange={e => f("investigation_summary", e.target.value)} rows={2} className="w-full mt-1 bg-background border border-border rounded-xl px-3 py-2.5 text-sm resize-none" />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs text-muted-foreground">תיאור פתרון</Label>
                  <textarea value={form.resolution_description || ""} onChange={e => f("resolution_description", e.target.value)} rows={2} className="w-full mt-1 bg-background border border-border rounded-xl px-3 py-2.5 text-sm resize-none" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">סיבת שורש מאושרת</Label>
                  <Input value={form.root_cause_confirmed || ""} onChange={e => f("root_cause_confirmed", e.target.value)} className="mt-1 bg-background border-border" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">מניעת הישנות</Label>
                  <Input value={form.prevent_recurrence || ""} onChange={e => f("prevent_recurrence", e.target.value)} className="mt-1 bg-background border-border" />
                </div>
                <div className="flex items-center gap-2 col-span-2">
                  <input type="checkbox" checked={form.customer_notified || false} onChange={e => f("customer_notified", e.target.checked)} id="notif" />
                  <Label htmlFor="notif" className="text-sm text-muted-foreground cursor-pointer">לקוח קיבל עדכון</Label>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="p-5 border-t border-border flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>ביטול</Button>
          <Button onClick={save} disabled={saving} className="bg-orange-500/80 hover:bg-orange-500 text-foreground">
            {saving ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Save className="w-4 h-4 ml-1" />}שמור
          </Button>
        </div>
      </div>
    </div>
  );
}

function DetailModal({ complaint, onClose, onEdit }: { complaint: any; onClose: () => void; onEdit: () => void }) {
  const [investigations, setInvestigations] = useState<any[]>([]);
  const [newStep, setNewStep] = useState({ action_taken: "", findings: "", investigator: "" });
  const [addingStep, setAddingStep] = useState(false);

  useEffect(() => {
    authFetch(`${BASE}/complaints/${complaint.id}`).then(r => r.json()).then(d => setInvestigations(d.investigations || []));
  }, [complaint.id]);

  const addStep = async () => {
    if (!newStep.action_taken) return;
    setAddingStep(true);
    await authFetch(`${BASE}/complaints/${complaint.id}/investigations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...newStep, investigation_date: new Date().toISOString().slice(0, 10) }) });
    const r = await authFetch(`${BASE}/complaints/${complaint.id}`);
    const d = await r.json();
    setInvestigations(d.investigations || []);
    setNewStep({ action_taken: "", findings: "", investigator: "" });
    setAddingStep(false);
  };

  const currentStage = LIFECYCLE.indexOf(complaint.status);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <h2 className="text-lg font-bold text-foreground">{complaint.complaint_number}</h2>
            <div className="flex items-center gap-2 mt-1">
              <Badge className={`${STATUS_COLOR[complaint.status]} border-0 text-xs`}>{STATUS_HE[complaint.status]}</Badge>
              <Badge className={`${SEV_COLOR[complaint.severity] || ""} border-0 text-xs`}>{SEV_HE[complaint.severity] || complaint.severity}</Badge>
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-5">
          <div className="flex items-center gap-1 overflow-x-auto pb-1">
            {LIFECYCLE.map((stage, i) => (
              <div key={stage} className="flex items-center gap-1">
                <div className={`px-2 py-1 rounded text-[10px] font-medium whitespace-nowrap ${i <= currentStage ? "bg-primary/20 text-primary" : "bg-muted/20 text-muted-foreground"}`}>
                  {STATUS_HE[stage]}
                </div>
                {i < LIFECYCLE.length - 1 && <ChevronLeft className={`w-3 h-3 flex-shrink-0 ${i < currentStage ? "text-primary" : "text-muted-foreground/40"}`} />}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-background/50 rounded-xl p-3"><div className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><User className="w-3 h-3" />לקוח</div><div className="text-foreground font-medium">{complaint.customer_name}</div>{complaint.customer_reference && <div className="text-xs text-muted-foreground">אסמכתא: {complaint.customer_reference}</div>}</div>
            <div className="bg-background/50 rounded-xl p-3"><div className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Package className="w-3 h-3" />מוצר</div><div className="text-foreground font-medium">{complaint.product_name || "—"}</div>{complaint.batch_reference && <div className="text-xs text-muted-foreground">אצווה: {complaint.batch_reference}</div>}</div>
            <div className="bg-background/50 rounded-xl p-3"><div className="text-xs text-muted-foreground mb-1">תאריך קבלה</div><div className="text-foreground">{complaint.received_date?.slice(0, 10)}</div></div>
            <div className="bg-background/50 rounded-xl p-3"><div className="text-xs text-muted-foreground mb-1">SLA</div><SlaIndicator sla_status={complaint.sla_status} target_date={complaint.target_resolution_date} /></div>
            <div className="col-span-2 bg-background/50 rounded-xl p-3"><div className="text-xs text-muted-foreground mb-1">תיאור תלונה</div><div className="text-foreground text-sm">{complaint.description}</div></div>
            {complaint.investigation_summary && <div className="col-span-2 bg-background/50 rounded-xl p-3"><div className="text-xs text-muted-foreground mb-1">סיכום חקירה</div><div className="text-foreground text-sm">{complaint.investigation_summary}</div></div>}
            {complaint.resolution_description && <div className="col-span-2 bg-background/50 rounded-xl p-3"><div className="text-xs text-muted-foreground mb-1">פתרון</div><div className="text-foreground text-sm">{complaint.resolution_description}</div></div>}
          </div>

          <div>
            <h3 className="text-sm font-semibold text-orange-400 border-b border-border pb-2 mb-3">שלבי חקירה</h3>
            {investigations.length === 0 ? (
              <p className="text-sm text-muted-foreground">אין שלבי חקירה עדיין</p>
            ) : (
              <div className="space-y-2">
                {investigations.map((step: any) => (
                  <div key={step.id} className="bg-background/50 rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-6 h-6 rounded-full bg-orange-500/20 text-orange-300 flex items-center justify-center text-xs font-bold">{step.step_number}</div>
                      <span className="text-xs text-muted-foreground">{step.investigation_date?.slice(0, 10)} | {step.investigator}</span>
                    </div>
                    <div className="text-sm text-foreground">{step.action_taken}</div>
                    {step.findings && <div className="text-xs text-muted-foreground mt-1">ממצאים: {step.findings}</div>}
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3 space-y-2 border border-dashed border-border/50 rounded-xl p-3">
              <div className="text-xs text-muted-foreground font-semibold">הוסף שלב חקירה</div>
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <Input value={newStep.action_taken} onChange={e => setNewStep(p => ({ ...p, action_taken: e.target.value }))} placeholder="פעולה שנעשתה" className="bg-background border-border text-sm" />
                </div>
                <Input value={newStep.findings} onChange={e => setNewStep(p => ({ ...p, findings: e.target.value }))} placeholder="ממצאים" className="bg-background border-border text-sm" />
                <Input value={newStep.investigator} onChange={e => setNewStep(p => ({ ...p, investigator: e.target.value }))} placeholder="חוקר" className="bg-background border-border text-sm" />
              </div>
              <Button size="sm" onClick={addStep} disabled={addingStep || !newStep.action_taken} className="bg-primary">
                {addingStep ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}הוסף שלב
              </Button>
            </div>
          </div>
        </div>

        <div className="p-5 border-t border-border flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>סגור</Button>
          <Button onClick={onEdit} className="bg-orange-500/80 hover:bg-orange-500 text-foreground"><Edit2 className="w-4 h-4 ml-1" />ערוך</Button>
        </div>
      </div>
    </div>
  );
}

export default function ComplaintsPage() {
  const [data, setData] = useState<any[]>([]);
  const [ncrList, setNcrList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const perPage = 20;
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [viewItem, setViewItem] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r1, r2] = await Promise.all([authFetch(`${BASE}/complaints`), authFetch(`${BASE}/ncr`)]);
      if (r1.ok) { const j = await r1.json(); setData(Array.isArray(j) ? j : []); }
      if (r2.ok) { const j = await r2.json(); setNcrList(Array.isArray(j) ? j : []); }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    let d = data;
    if (statusFilter !== "all") d = d.filter(r => r.status === statusFilter);
    if (search) { const s = search.toLowerCase(); d = d.filter(r => r.customer_name?.toLowerCase().includes(s) || r.complaint_number?.toLowerCase().includes(s) || r.description?.toLowerCase().includes(s)); }
    return d;
  }, [data, statusFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageData = filtered.slice((page - 1) * perPage, page * perPage);

  const stats = useMemo(() => ({
    total: data.length,
    open: data.filter(r => r.status === "received").length,
    investigating: data.filter(r => r.status === "investigating").length,
    overdue: data.filter(r => r.sla_status === "overdue").length,
    resolved: data.filter(r => r.status === "resolved" || r.status === "closed").length,
  }), [data]);

  const deleteItem = async (id: number) => {
    if (!confirm("למחוק תלונה זו?")) return;
    await authFetch(`${BASE}/complaints/${id}`, { method: "DELETE" });
    load();
  };

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-orange-400" />תלונות לקוחות
          </h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול תלונות לקוחות, חקירה, מעקב SLA וקישור ל-NCR</p>
        </div>
        <Button onClick={() => { setEditItem(null); setShowForm(true); }} className="bg-orange-500/80 hover:bg-orange-500 text-foreground">
          <Plus className="w-4 h-4 ml-1" />תלונה חדשה
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "סה\"כ תלונות", value: stats.total, color: "text-foreground", icon: MessageSquare },
          { label: "ממתינות", value: stats.open, color: "text-blue-400", icon: Clock },
          { label: "בחקירה", value: stats.investigating, color: "text-yellow-400", icon: AlertCircle },
          { label: "באיחור SLA", value: stats.overdue, color: "text-red-400", icon: AlertTriangle },
          { label: "נפתרו", value: stats.resolved, color: "text-green-400", icon: CheckCircle2 },
        ].map((kpi, i) => (
          <Card key={i} className="bg-card border border-border/50">
            <CardContent className="p-4 flex items-center gap-3">
              <kpi.icon className={`${kpi.color} w-7 h-7 flex-shrink-0`} />
              <div>
                <div className="text-xl font-bold text-foreground">{kpi.value}</div>
                <div className="text-xs text-muted-foreground">{kpi.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-card/50 border border-border/50">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input placeholder="חיפוש..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pr-9 bg-background/50" />
            </div>
            <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="bg-background/50 border border-border rounded-lg px-3 py-2 text-sm">
              <option value="all">כל הסטטוסים</option>
              {STATUSES.map(s => <option key={s} value={s}>{STATUS_HE[s]}</option>)}
            </select>
          </div>

          {loading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-12 bg-muted/20 rounded-lg animate-pulse" />)}</div>
          ) : pageData.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <MessageSquare className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p>אין תלונות להצגה</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border/50">
                  <th className="text-right p-3 text-muted-foreground font-medium">מספר</th>
                  <th className="text-right p-3 text-muted-foreground font-medium">לקוח</th>
                  <th className="text-right p-3 text-muted-foreground font-medium">מוצר</th>
                  <th className="text-right p-3 text-muted-foreground font-medium">חומרה</th>
                  <th className="text-right p-3 text-muted-foreground font-medium">סטטוס</th>
                  <th className="text-right p-3 text-muted-foreground font-medium">SLA</th>
                  <th className="text-right p-3 text-muted-foreground font-medium">תאריך קבלה</th>
                  <th className="text-center p-3 text-muted-foreground font-medium w-24">פעולות</th>
                </tr></thead>
                <tbody>
                  {pageData.map((row: any) => (
                    <tr key={row.id} className="border-b border-border/30 hover:bg-card/30">
                      <td className="p-3 font-mono text-xs text-orange-400">{row.complaint_number}</td>
                      <td className="p-3 text-foreground font-medium">{row.customer_name}</td>
                      <td className="p-3 text-muted-foreground text-xs">{row.product_name || "—"}</td>
                      <td className="p-3"><Badge className={`${SEV_COLOR[row.severity] || ""} border-0 text-xs`}>{SEV_HE[row.severity] || row.severity}</Badge></td>
                      <td className="p-3"><Badge className={`${STATUS_COLOR[row.status] || ""} border-0 text-xs`}>{STATUS_HE[row.status] || row.status}</Badge></td>
                      <td className="p-3"><SlaIndicator sla_status={row.sla_status} target_date={row.target_resolution_date} /></td>
                      <td className="p-3 text-muted-foreground text-xs">{row.received_date?.slice(0, 10)}</td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => setViewItem(row)} className="p-1.5 hover:bg-muted rounded-lg"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                          <button onClick={() => { setEditItem(row); setShowForm(true); }} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
                          <button onClick={() => deleteItem(row.id)} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
            <span>מציג {Math.min(filtered.length, (page - 1) * perPage + 1)}–{Math.min(filtered.length, page * perPage)} מתוך {filtered.length}</span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronRight className="w-4 h-4" /></Button>
              <span className="px-3 py-1">{page}/{totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}><ChevronLeft className="w-4 h-4" /></Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {showForm && (
        <ComplaintForm initial={editItem} onSave={() => { setShowForm(false); load(); }} onClose={() => setShowForm(false)} ncrList={ncrList} />
      )}
      {viewItem && (
        <DetailModal complaint={viewItem} onClose={() => setViewItem(null)} onEdit={() => { setEditItem(viewItem); setViewItem(null); setShowForm(true); }} />
      )}
    </div>
  );
}
