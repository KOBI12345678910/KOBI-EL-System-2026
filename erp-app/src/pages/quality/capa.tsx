import { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Plus, Search, Download, Eye, Edit2, Trash2, ChevronRight, ChevronLeft,
  X, Save, AlertCircle, CheckCircle2, Clock, Loader2, FileText,
  AlertTriangle, ShieldCheck, GitBranch, Activity, TrendingDown, ArrowRight
} from "lucide-react";
import { authFetch } from "@/lib/utils";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";

const BASE = "/api/qms";

const NCR_STATUSES = ["open", "investigating", "contained", "closed"] as const;
const CAPA_STATUSES = ["initiated", "in-progress", "verification", "effectiveness-review", "closed"] as const;
const SEVERITIES = ["critical", "major", "minor"] as const;
const SOURCES = ["חומר גלם", "בתהליך", "מוצר מוגמר", "ספק", "לקוח"] as const;

const NCR_STATUS_HE: Record<string, string> = {
  open: "פתוח", investigating: "בחקירה", contained: "בכיל", closed: "סגור"
};
const CAPA_STATUS_HE: Record<string, string> = {
  initiated: "נפתח", "in-progress": "בביצוע", verification: "אימות", "effectiveness-review": "בחינת יעילות", closed: "סגור"
};
const SEV_HE: Record<string, string> = { critical: "קריטי", major: "מז'ורי", minor: "מינורי" };
const SEV_COLOR: Record<string, string> = {
  critical: "bg-red-500/20 text-red-300", major: "bg-orange-500/20 text-orange-300", minor: "bg-yellow-500/20 text-yellow-300"
};
const NCR_STATUS_COLOR: Record<string, string> = {
  open: "bg-red-500/20 text-red-300", investigating: "bg-yellow-500/20 text-yellow-300",
  contained: "bg-blue-500/20 text-blue-300", closed: "bg-green-500/20 text-green-300"
};
const CAPA_STATUS_COLOR: Record<string, string> = {
  initiated: "bg-purple-500/20 text-purple-300", "in-progress": "bg-blue-500/20 text-blue-300",
  verification: "bg-orange-500/20 text-orange-300", "effectiveness-review": "bg-cyan-500/20 text-cyan-300",
  closed: "bg-green-500/20 text-green-300"
};

const CAPA_PIPELINE = ["initiated", "in-progress", "verification", "effectiveness-review", "closed"];

type Tab = "ncr" | "capa" | "5why" | "ishikawa";

function useQmsData(endpoint: string) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await authFetch(`${BASE}/${endpoint}`);
      if (r.ok) { const j = await r.json(); setData(Array.isArray(j) ? j : []); }
    } catch {}
    setLoading(false);
  }, [endpoint]);
  useEffect(() => { load(); }, [load]);
  return { data, loading, reload: load };
}

function StatusBadge({ status, map, colorMap }: { status: string; map: Record<string, string>; colorMap: Record<string, string> }) {
  return <Badge className={`${colorMap[status] || "bg-gray-500/20 text-gray-300"} border-0 text-xs`}>{map[status] || status}</Badge>;
}

function NcrForm({ initial, onSave, onClose, ncrList }: { initial?: any; onSave: () => void; onClose: () => void; ncrList: any[] }) {
  const [form, setForm] = useState(initial || {
    title: "", source: "בתהליך", product_name: "", product_code: "", batch_reference: "",
    quantity_affected: 1, defect_type: "", severity: "minor", disposition: "pending",
    status: "open", detected_by: "", detection_date: new Date().toISOString().slice(0, 10),
    responsible_person: "", containment_action: "", root_cause_summary: "", cost_impact: 0
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const validation = useFormValidation({
    title: { required: true, message: "תיאור אי-ההתאמה חובה" },
    detected_by: { required: true, message: "שם המגלה חובה" },
  });

  const f = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));

  const save = async () => {
    if (!validation.validate(form)) return;
    setSaving(true); setError("");
    try {
      const url = initial ? `${BASE}/ncr/${initial.id}` : `${BASE}/ncr`;
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
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2"><TrendingDown className="w-5 h-5 text-red-400" />{initial ? "עריכת NCR" : "NCR חדש"}</h2>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-5">
          {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-300 text-sm">{error}</div>}

          <div>
            <h3 className="text-sm font-semibold text-blue-400 border-b border-border pb-2 mb-3">פרטי אי-ההתאמה</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label className="text-xs text-muted-foreground">תיאור <RequiredMark /></Label>
                <Input value={form.title || ""} onChange={e => f("title", e.target.value)} className={`mt-1 bg-background border-border ${validation.getFieldProps("title").className}`} placeholder="תאר את אי-ההתאמה" />
                <FormFieldError error={validation.errors.title} />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">מקור</Label>
                <select value={form.source || ""} onChange={e => f("source", e.target.value)} className="w-full mt-1 bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                  {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">חומרה</Label>
                <select value={form.severity || "minor"} onChange={e => f("severity", e.target.value)} className="w-full mt-1 bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                  {SEVERITIES.map(s => <option key={s} value={s}>{SEV_HE[s]}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">שם מוצר</Label>
                <Input value={form.product_name || ""} onChange={e => f("product_name", e.target.value)} className="mt-1 bg-background border-border" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">אצווה</Label>
                <Input value={form.batch_reference || ""} onChange={e => f("batch_reference", e.target.value)} className="mt-1 bg-background border-border" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">כמות מושפעת</Label>
                <Input type="number" value={form.quantity_affected || ""} onChange={e => f("quantity_affected", e.target.value)} className="mt-1 bg-background border-border" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">סוג פגם</Label>
                <Input value={form.defect_type || ""} onChange={e => f("defect_type", e.target.value)} className="mt-1 bg-background border-border" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">מגלה <RequiredMark /></Label>
                <Input value={form.detected_by || ""} onChange={e => f("detected_by", e.target.value)} className={`mt-1 bg-background border-border ${validation.getFieldProps("detected_by").className}`} />
                <FormFieldError error={validation.errors.detected_by} />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">תאריך גילוי</Label>
                <Input type="date" value={form.detection_date || ""} onChange={e => f("detection_date", e.target.value)} className="mt-1 bg-background border-border" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">אחראי טיפול</Label>
                <Input value={form.responsible_person || ""} onChange={e => f("responsible_person", e.target.value)} className="mt-1 bg-background border-border" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">עלות (₪)</Label>
                <Input type="number" value={form.cost_impact || ""} onChange={e => f("cost_impact", e.target.value)} className="mt-1 bg-background border-border" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">הנחיית טיפול</Label>
                <select value={form.disposition || "pending"} onChange={e => f("disposition", e.target.value)} className="w-full mt-1 bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                  <option value="pending">ממתין</option>
                  <option value="rework">תיקון</option>
                  <option value="scrap">גריטה</option>
                  <option value="accepted">קבלה</option>
                  <option value="return_to_supplier">החזרה לספק</option>
                </select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">סטטוס</Label>
                <select value={form.status || "open"} onChange={e => f("status", e.target.value)} className="w-full mt-1 bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                  {NCR_STATUSES.map(s => <option key={s} value={s}>{NCR_STATUS_HE[s]}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <Label className="text-xs text-muted-foreground">פעולת הכלה</Label>
                <textarea value={form.containment_action || ""} onChange={e => f("containment_action", e.target.value)} rows={2} className="w-full mt-1 bg-background border border-border rounded-xl px-3 py-2.5 text-sm resize-none" />
              </div>
              <div className="col-span-2">
                <Label className="text-xs text-muted-foreground">סיכום ניתוח שורש</Label>
                <textarea value={form.root_cause_summary || ""} onChange={e => f("root_cause_summary", e.target.value)} rows={2} className="w-full mt-1 bg-background border border-border rounded-xl px-3 py-2.5 text-sm resize-none" />
              </div>
            </div>
          </div>
        </div>
        <div className="p-5 border-t border-border flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>ביטול</Button>
          <Button onClick={save} disabled={saving} className="bg-primary">
            {saving ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Save className="w-4 h-4 ml-1" />}שמור
          </Button>
        </div>
      </div>
    </div>
  );
}

function CapaForm({ initial, ncrList, onSave, onClose }: { initial?: any; ncrList: any[]; onSave: () => void; onClose: () => void }) {
  const [form, setForm] = useState(initial || {
    title: "", description: "", type: "corrective", source_type: "ncr", source_ncr_id: "",
    responsible_person: "", department: "", due_date: "", status: "initiated",
    priority: "medium", verification_method: "", notes: ""
  });
  const [saving, setSaving] = useState(false);

  const validation = useFormValidation({
    title: { required: true, message: "כותרת CAPA חובה" },
    responsible_person: { required: true, message: "אחראי טיפול חובה" },
    due_date: { required: true, message: "תאריך יעד חובה" },
  });

  const f = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));

  const save = async () => {
    if (!validation.validate(form)) return;
    setSaving(true);
    try {
      const url = initial ? `${BASE}/capa/${initial.id}` : `${BASE}/capa`;
      await authFetch(url, { method: initial ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      onSave();
    } catch {}
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-blue-400" />{initial ? "עריכת CAPA" : "CAPA חדש"}</h2>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Label className="text-xs text-muted-foreground">כותרת <RequiredMark /></Label>
            <Input value={form.title || ""} onChange={e => f("title", e.target.value)} className={`mt-1 bg-background border-border ${validation.getFieldProps("title").className}`} />
            <FormFieldError error={validation.errors.title} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">סוג</Label>
            <select value={form.type || "corrective"} onChange={e => f("type", e.target.value)} className="w-full mt-1 bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
              <option value="corrective">מתקן</option>
              <option value="preventive">מניעתי</option>
            </select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">עדיפות</Label>
            <select value={form.priority || "medium"} onChange={e => f("priority", e.target.value)} className="w-full mt-1 bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
              <option value="low">נמוכה</option>
              <option value="medium">בינונית</option>
              <option value="high">גבוהה</option>
              <option value="critical">קריטי</option>
            </select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">NCR מקור</Label>
            <select value={form.source_ncr_id || ""} onChange={e => f("source_ncr_id", e.target.value)} className="w-full mt-1 bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
              <option value="">ללא</option>
              {ncrList.map((n: any) => <option key={n.id} value={n.id}>{n.ncr_number} — {n.title?.slice(0, 40)}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">אחראי <RequiredMark /></Label>
            <Input value={form.responsible_person || ""} onChange={e => f("responsible_person", e.target.value)} className={`mt-1 bg-background border-border ${validation.getFieldProps("responsible_person").className}`} />
            <FormFieldError error={validation.errors.responsible_person} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">מחלקה</Label>
            <Input value={form.department || ""} onChange={e => f("department", e.target.value)} className="mt-1 bg-background border-border" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">תאריך יעד <RequiredMark /></Label>
            <Input type="date" value={form.due_date || ""} onChange={e => f("due_date", e.target.value)} className={`mt-1 bg-background border-border ${validation.getFieldProps("due_date").className}`} />
            <FormFieldError error={validation.errors.due_date} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">סטטוס</Label>
            <select value={form.status || "initiated"} onChange={e => f("status", e.target.value)} className="w-full mt-1 bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
              {CAPA_STATUSES.map(s => <option key={s} value={s}>{CAPA_STATUS_HE[s]}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <Label className="text-xs text-muted-foreground">תיאור</Label>
            <textarea value={form.description || ""} onChange={e => f("description", e.target.value)} rows={3} className="w-full mt-1 bg-background border border-border rounded-xl px-3 py-2.5 text-sm resize-none" />
          </div>
          <div className="col-span-2">
            <Label className="text-xs text-muted-foreground">שיטת אימות</Label>
            <Input value={form.verification_method || ""} onChange={e => f("verification_method", e.target.value)} className="mt-1 bg-background border-border" />
          </div>
          <div className="col-span-2">
            <Label className="text-xs text-muted-foreground">הערות</Label>
            <textarea value={form.notes || ""} onChange={e => f("notes", e.target.value)} rows={2} className="w-full mt-1 bg-background border border-border rounded-xl px-3 py-2.5 text-sm resize-none" />
          </div>
        </div>
        <div className="p-5 border-t border-border flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>ביטול</Button>
          <Button onClick={save} disabled={saving} className="bg-primary">
            {saving ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Save className="w-4 h-4 ml-1" />}שמור
          </Button>
        </div>
      </div>
    </div>
  );
}

function FiveWhyTool({ ncrList }: { ncrList: any[] }) {
  const [selectedNcr, setSelectedNcr] = useState<string>("");
  const [form, setForm] = useState({ why1: "", why2: "", why3: "", why4: "", why5: "", root_cause: "" });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const f = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));
  const whys = [
    { key: "why1", q: "למה הבעיה התרחשה?" },
    { key: "why2", q: "למה הגורם הראשון התרחש?" },
    { key: "why3", q: "למה הגורם השני התרחש?" },
    { key: "why4", q: "למה הגורם השלישי התרחש?" },
    { key: "why5", q: "למה הגורם הרביעי התרחש?" },
  ];

  const save = async () => {
    if (!selectedNcr) return;
    setSaving(true);
    try {
      await authFetch(`${BASE}/ncr/${selectedNcr}/rca`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ method: "5why", ...form }) });
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch {}
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <Label className="text-xs text-muted-foreground">בחר NCR</Label>
          <select value={selectedNcr} onChange={e => setSelectedNcr(e.target.value)} className="w-full mt-1 bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
            <option value="">-- בחר NCR --</option>
            {ncrList.map((n: any) => <option key={n.id} value={n.id}>{n.ncr_number} — {n.title?.slice(0, 50)}</option>)}
          </select>
        </div>
      </div>
      <div className="space-y-3">
        {whys.map((w, i) => (
          <div key={w.key} className="bg-card/50 border border-border/50 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-full bg-blue-500/20 text-blue-300 flex items-center justify-center text-sm font-bold">{i + 1}</div>
              <span className="text-sm font-medium text-muted-foreground">{w.q}</span>
              {i > 0 && (form as any)[`why${i}`] && (
                <span className="text-xs text-blue-400/70 mr-auto flex items-center gap-1">
                  <ArrowRight className="w-3 h-3" />כי: {(form as any)[`why${i}`]?.slice(0, 40)}
                </span>
              )}
            </div>
            <textarea value={(form as any)[w.key] || ""} onChange={e => f(w.key, e.target.value)} rows={2} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm resize-none" placeholder={`למה ${i + 1}...`} />
          </div>
        ))}
        <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-4">
          <Label className="text-xs text-green-400 font-semibold">סיבת שורש מאושרת</Label>
          <textarea value={form.root_cause || ""} onChange={e => f("root_cause", e.target.value)} rows={2} className="w-full mt-2 bg-background border border-border rounded-lg px-3 py-2 text-sm resize-none" placeholder="הגדר את סיבת השורש..." />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button onClick={save} disabled={saving || !selectedNcr} className="bg-primary">
          {saving ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : saved ? <CheckCircle2 className="w-4 h-4 ml-1 text-green-400" /> : <Save className="w-4 h-4 ml-1" />}
          {saved ? "נשמר!" : "שמור ניתוח"}
        </Button>
      </div>
    </div>
  );
}

function IshikawaTool({ ncrList }: { ncrList: any[] }) {
  const [selectedNcr, setSelectedNcr] = useState<string>("");
  const [form, setForm] = useState({
    ishikawa_man: "", ishikawa_machine: "", ishikawa_material: "",
    ishikawa_method: "", ishikawa_measurement: "", ishikawa_environment: "", root_cause: ""
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const f = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const bones = [
    { key: "ishikawa_man", label: "אדם (Man)", color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
    { key: "ishikawa_machine", label: "מכונה (Machine)", color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/20" },
    { key: "ishikawa_material", label: "חומר (Material)", color: "text-green-400", bg: "bg-green-500/10 border-green-500/20" },
    { key: "ishikawa_method", label: "שיטה (Method)", color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/20" },
    { key: "ishikawa_measurement", label: "מדידה (Measurement)", color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/20" },
    { key: "ishikawa_environment", label: "סביבה (Environment)", color: "text-cyan-400", bg: "bg-cyan-500/10 border-cyan-500/20" },
  ];

  const save = async () => {
    if (!selectedNcr) return;
    setSaving(true);
    try {
      await authFetch(`${BASE}/ncr/${selectedNcr}/rca`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ method: "ishikawa", ...form }) });
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch {}
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <Label className="text-xs text-muted-foreground">בחר NCR</Label>
        <select value={selectedNcr} onChange={e => setSelectedNcr(e.target.value)} className="w-full mt-1 bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="">-- בחר NCR --</option>
          {ncrList.map((n: any) => <option key={n.id} value={n.id}>{n.ncr_number} — {n.title?.slice(0, 50)}</option>)}
        </select>
      </div>

      <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-3 text-center">
        <span className="text-red-400 font-semibold text-sm">⟵ אפקט / הבעיה</span>
        {selectedNcr && <div className="text-xs text-muted-foreground mt-1">{ncrList.find((n: any) => String(n.id) === selectedNcr)?.title}</div>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {bones.map(bone => (
          <div key={bone.key} className={`border rounded-xl p-3 ${bone.bg}`}>
            <Label className={`text-xs font-semibold ${bone.color}`}>{bone.label}</Label>
            <textarea value={(form as any)[bone.key] || ""} onChange={e => f(bone.key, e.target.value)} rows={3} className="w-full mt-2 bg-background border border-border rounded-lg px-3 py-2 text-sm resize-none" placeholder="הכנס גורמים..." />
          </div>
        ))}
      </div>

      <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
        <Label className="text-xs text-red-400 font-semibold">סיבת שורש מאושרת</Label>
        <textarea value={form.root_cause || ""} onChange={e => f("root_cause", e.target.value)} rows={2} className="w-full mt-2 bg-background border border-border rounded-lg px-3 py-2 text-sm resize-none" placeholder="הגדר את סיבת השורש..." />
      </div>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving || !selectedNcr} className="bg-primary">
          {saving ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : saved ? <CheckCircle2 className="w-4 h-4 ml-1 text-green-400" /> : <Save className="w-4 h-4 ml-1" />}
          {saved ? "נשמר!" : "שמור ניתוח"}
        </Button>
      </div>
    </div>
  );
}

function CapaPipeline({ item }: { item: any }) {
  const currentIdx = CAPA_PIPELINE.indexOf(item.status);
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
      {CAPA_PIPELINE.map((stage, i) => (
        <div key={stage} className="flex items-center gap-1">
          <div className={`px-2 py-1 rounded text-[10px] font-medium whitespace-nowrap ${i <= currentIdx ? "bg-primary/20 text-primary" : "bg-muted/20 text-muted-foreground"}`}>
            {CAPA_STATUS_HE[stage]}
          </div>
          {i < CAPA_PIPELINE.length - 1 && <ChevronLeft className={`w-3 h-3 flex-shrink-0 ${i < currentIdx ? "text-primary" : "text-muted-foreground/40"}`} />}
        </div>
      ))}
    </div>
  );
}

export default function CapaPage() {
  const { data: ncrList, loading: ncrLoading, reload: reloadNcr } = useQmsData("ncr");
  const { data: capaList, loading: capaLoading, reload: reloadCapa } = useQmsData("capa");
  const [tab, setTab] = useState<Tab>("ncr");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const perPage = 20;
  const [showNcrForm, setShowNcrForm] = useState(false);
  const [showCapaForm, setShowCapaForm] = useState(false);
  const [editNcr, setEditNcr] = useState<any>(null);
  const [editCapa, setEditCapa] = useState<any>(null);

  const filteredNcr = useMemo(() => {
    let d = ncrList;
    if (statusFilter !== "all") d = d.filter(r => r.status === statusFilter);
    if (search) { const s = search.toLowerCase(); d = d.filter(r => r.title?.toLowerCase().includes(s) || r.ncr_number?.toLowerCase().includes(s) || r.product_name?.toLowerCase().includes(s)); }
    return d;
  }, [ncrList, statusFilter, search]);

  const filteredCapa = useMemo(() => {
    let d = capaList;
    if (statusFilter !== "all") d = d.filter(r => r.status === statusFilter);
    if (search) { const s = search.toLowerCase(); d = d.filter(r => r.title?.toLowerCase().includes(s) || r.capa_number?.toLowerCase().includes(s)); }
    return d;
  }, [capaList, statusFilter, search]);

  const deleteNcr = async (id: number) => {
    if (!confirm("למחוק NCR זה?")) return;
    await authFetch(`${BASE}/ncr/${id}`, { method: "DELETE" });
    reloadNcr();
  };

  const deleteCapa = async (id: number) => {
    if (!confirm("למחוק CAPA זה?")) return;
    await authFetch(`${BASE}/capa/${id}`, { method: "DELETE" });
    reloadCapa();
  };

  const activeList = tab === "ncr" ? filteredNcr : filteredCapa;
  const totalPages = Math.max(1, Math.ceil(activeList.length / perPage));
  const pageData = activeList.slice((page - 1) * perPage, page * perPage);

  const ncrStats = useMemo(() => ({
    open: ncrList.filter(r => r.status === "open").length,
    investigating: ncrList.filter(r => r.status === "investigating").length,
    critical: ncrList.filter(r => r.severity === "critical").length,
    closed: ncrList.filter(r => r.status === "closed").length,
  }), [ncrList]);

  const capaStats = useMemo(() => ({
    initiated: capaList.filter(r => r.status === "initiated").length,
    inProgress: capaList.filter(r => r.status === "in-progress").length,
    overdue: capaList.filter(r => r.due_date && new Date(r.due_date) < new Date() && r.status !== "closed").length,
    closed: capaList.filter(r => r.status === "closed").length,
  }), [capaList]);

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-blue-400" />NCR & CAPA — ניהול אי-התאמות ופעולות מתקנות
          </h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול Non-Conformance Reports, ניתוח שורש, ופעולות מתקנות/מניעתיות</p>
        </div>
        <div className="flex gap-2">
          {tab === "ncr" && <Button onClick={() => { setEditNcr(null); setShowNcrForm(true); }} className="bg-red-500/80 hover:bg-red-500 text-foreground"><Plus className="w-4 h-4 ml-1" />NCR חדש</Button>}
          {tab === "capa" && <Button onClick={() => { setEditCapa(null); setShowCapaForm(true); }} className="bg-blue-600 hover:bg-blue-700"><Plus className="w-4 h-4 ml-1" />CAPA חדש</Button>}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {tab === "ncr" ? [
          { label: "NCR פתוחים", value: ncrStats.open, color: "text-red-400", icon: AlertCircle },
          { label: "בחקירה", value: ncrStats.investigating, color: "text-yellow-400", icon: Activity },
          { label: "קריטיים", value: ncrStats.critical, color: "text-orange-400", icon: AlertTriangle },
          { label: "נסגרו", value: ncrStats.closed, color: "text-green-400", icon: CheckCircle2 },
        ] : [
          { label: "נפתחו", value: capaStats.initiated, color: "text-purple-400", icon: FileText },
          { label: "בביצוע", value: capaStats.inProgress, color: "text-blue-400", icon: Activity },
          { label: "באיחור", value: capaStats.overdue, color: "text-red-400", icon: Clock },
          { label: "נסגרו", value: capaStats.closed, color: "text-green-400", icon: CheckCircle2 },
        ].map((kpi, i) => (
          <Card key={i} className="bg-card border border-border/50">
            <CardContent className="p-4 flex items-center gap-3">
              <kpi.icon className={`${kpi.color} w-8 h-8 flex-shrink-0`} />
              <div>
                <div className="text-2xl font-bold text-foreground">{kpi.value}</div>
                <div className="text-xs text-muted-foreground">{kpi.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex gap-1 border-b border-border/50">
        {([
          { key: "ncr", label: "NCR — אי-התאמות", icon: TrendingDown },
          { key: "capa", label: "CAPA — פעולות מתקנות", icon: ShieldCheck },
          { key: "5why", label: "5 למה", icon: GitBranch },
          { key: "ishikawa", label: "דיאגרמת עצם דג", icon: Activity },
        ] as const).map(t => (
          <button key={t.key} onClick={() => { setTab(t.key); setPage(1); }} className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            <t.icon className="w-4 h-4" />{t.label}
          </button>
        ))}
      </div>

      {(tab === "5why" || tab === "ishikawa") ? (
        <Card className="bg-card/50 border border-border/50">
          <CardContent className="p-5">
            {tab === "5why" ? <FiveWhyTool ncrList={ncrList} /> : <IshikawaTool ncrList={ncrList} />}
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-card/50 border border-border/50">
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-3 mb-4">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
                <Input placeholder="חיפוש..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pr-9 bg-background/50" />
              </div>
              <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="bg-background/50 border border-border rounded-lg px-3 py-2 text-sm">
                <option value="all">כל הסטטוסים</option>
                {(tab === "ncr" ? NCR_STATUSES : CAPA_STATUSES).map(s => <option key={s} value={s}>{tab === "ncr" ? NCR_STATUS_HE[s] : CAPA_STATUS_HE[s]}</option>)}
              </select>
            </div>

            {(tab === "ncr" ? ncrLoading : capaLoading) ? (
              <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-12 bg-muted/20 rounded-lg animate-pulse" />)}</div>
            ) : pageData.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <AlertCircle className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p>אין נתונים להצגה</p>
              </div>
            ) : tab === "ncr" ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-border/50">
                    <th className="text-right p-3 text-muted-foreground font-medium">מספר NCR</th>
                    <th className="text-right p-3 text-muted-foreground font-medium">תיאור</th>
                    <th className="text-right p-3 text-muted-foreground font-medium">מקור</th>
                    <th className="text-right p-3 text-muted-foreground font-medium">מוצר</th>
                    <th className="text-right p-3 text-muted-foreground font-medium">חומרה</th>
                    <th className="text-right p-3 text-muted-foreground font-medium">סטטוס</th>
                    <th className="text-right p-3 text-muted-foreground font-medium">תאריך</th>
                    <th className="text-center p-3 text-muted-foreground font-medium w-20">פעולות</th>
                  </tr></thead>
                  <tbody>
                    {pageData.map((row: any) => (
                      <tr key={row.id} className="border-b border-border/30 hover:bg-card/30">
                        <td className="p-3 font-mono text-xs text-blue-400">{row.ncr_number}</td>
                        <td className="p-3 text-foreground max-w-[200px] truncate">{row.title}</td>
                        <td className="p-3 text-muted-foreground text-xs">{row.source}</td>
                        <td className="p-3 text-muted-foreground text-xs">{row.product_name || "—"}</td>
                        <td className="p-3"><Badge className={`${SEV_COLOR[row.severity] || "bg-gray-500/20 text-gray-300"} border-0 text-xs`}>{SEV_HE[row.severity] || row.severity}</Badge></td>
                        <td className="p-3"><StatusBadge status={row.status} map={NCR_STATUS_HE} colorMap={NCR_STATUS_COLOR} /></td>
                        <td className="p-3 text-muted-foreground text-xs">{row.detection_date?.slice(0, 10)}</td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => { setEditNcr(row); setShowNcrForm(true); }} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
                            <button onClick={() => deleteNcr(row.id)} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="space-y-3">
                {pageData.map((row: any) => (
                  <div key={row.id} className="bg-card border border-border/50 rounded-xl p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs text-blue-400">{row.capa_number}</span>
                          <Badge className={`${row.type === "corrective" ? "bg-orange-500/20 text-orange-300" : "bg-green-500/20 text-green-300"} border-0 text-xs`}>{row.type === "corrective" ? "מתקן" : "מניעתי"}</Badge>
                          <StatusBadge status={row.status} map={CAPA_STATUS_HE} colorMap={CAPA_STATUS_COLOR} />
                          {row.due_date && new Date(row.due_date) < new Date() && row.status !== "closed" && <Badge className="bg-red-500/20 text-red-300 border-0 text-xs">באיחור</Badge>}
                        </div>
                        <div className="text-foreground font-medium mt-1">{row.title}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">אחראי: {row.responsible_person || "—"} | יעד: {row.due_date?.slice(0, 10) || "—"}</div>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <button onClick={() => { setEditCapa(row); setShowCapaForm(true); }} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
                        <button onClick={() => deleteCapa(row.id)} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                      </div>
                    </div>
                    <CapaPipeline item={row} />
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
              <span>מציג {Math.min(activeList.length, (page - 1) * perPage + 1)}–{Math.min(activeList.length, page * perPage)} מתוך {activeList.length}</span>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronRight className="w-4 h-4" /></Button>
                <span className="px-3 py-1">{page}/{totalPages}</span>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}><ChevronLeft className="w-4 h-4" /></Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {showNcrForm && <NcrForm initial={editNcr} onSave={() => { setShowNcrForm(false); reloadNcr(); }} onClose={() => setShowNcrForm(false)} ncrList={ncrList} />}
      {showCapaForm && <CapaForm initial={editCapa} ncrList={ncrList} onSave={() => { setShowCapaForm(false); reloadCapa(); }} onClose={() => setShowCapaForm(false)} />}
    </div>
  );
}
