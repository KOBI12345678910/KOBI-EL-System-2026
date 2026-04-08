import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2, XCircle, Clock, AlertTriangle, ChevronRight,
  Settings, RefreshCw, Eye, Loader2, Shield, ArrowLeft, Plus,
  Trash2, User, CalendarDays, DollarSign, BarChart3, GitBranch,
  FileCheck, ArrowRight, X, Save
} from "lucide-react";
import { authFetch } from "@/lib/utils";

const API = "/api";
const fmt = (v: any) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(Number(v || 0));
const fmtDate = (d: any) => d ? new Date(d).toLocaleDateString("he-IL") : "-";
const fmtDateTime = (d: any) => d ? new Date(d).toLocaleString("he-IL") : "-";

const stepStatusColors: Record<string, string> = {
  "מאושר": "bg-green-500/20 text-green-400 border-green-500/30",
  "approved": "bg-green-500/20 text-green-400 border-green-500/30",
  "נדחה": "bg-red-500/20 text-red-400 border-red-500/30",
  "rejected": "bg-red-500/20 text-red-400 border-red-500/30",
  "ממתין": "bg-amber-500/20 text-amber-400 border-amber-500/30",
  "waiting": "bg-amber-500/20 text-amber-400 border-amber-500/30",
  "ממתין - נעול": "bg-gray-500/20 text-gray-400 border-gray-500/30",
  "locked": "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

const stepStatusLabel: Record<string, string> = {
  "מאושר": "מאושר", "approved": "מאושר",
  "נדחה": "נדחה", "rejected": "נדחה",
  "ממתין": "ממתין לאישור", "waiting": "ממתין לאישור",
  "ממתין - נעול": "ממתין (נעול)", "locked": "ממתין (נעול)",
};

const stepStatusIcon: Record<string, any> = {
  "מאושר": CheckCircle2, "approved": CheckCircle2,
  "נדחה": XCircle, "rejected": XCircle,
  "ממתין": Clock, "waiting": Clock,
  "ממתין - נעול": Shield, "locked": Shield,
};

function ChainVisualization({ steps, onApprove, onReject, loading }: {
  steps: any[];
  onApprove: (stepId: number) => void;
  onReject: (stepId: number) => void;
  loading: boolean;
}) {
  if (!steps.length) return (
    <div className="text-center py-8 text-muted-foreground">
      <GitBranch className="mx-auto mb-2 opacity-40" size={32} />
      <p>אין שלבי אישור להצגה</p>
    </div>
  );

  return (
    <div className="flex flex-col gap-0">
      {steps.map((step, i) => {
        const Icon = stepStatusIcon[step.status] || Clock;
        const colorClass = stepStatusColors[step.status] || stepStatusColors["ממתין - נעול"];
        const isActive = step.status === "ממתין" || step.status === "waiting";
        return (
          <div key={step.id} className="flex flex-col items-center">
            <div className={`w-full rounded-lg border p-4 transition-all ${isActive ? "border-amber-500/50 bg-amber-500/5" : "border-border/40 bg-card/50"}`}>
              <div className="flex items-start gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border ${colorClass}`}>
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{step.required_role || step.requiredRole}</span>
                    <Badge className={`text-xs ${colorClass}`}>
                      <Icon size={10} className="ml-1" />
                      {stepStatusLabel[step.status] || step.status}
                    </Badge>
                    {isActive && (
                      <Badge className="text-xs bg-amber-500/20 text-amber-400 animate-pulse">
                        מחכה לאישורך
                      </Badge>
                    )}
                  </div>
                  {step.approved_by && (
                    <p className="text-xs text-muted-foreground mt-1">
                      אושר על ידי {step.approved_by} · {fmtDateTime(step.approved_at)}
                    </p>
                  )}
                  {step.rejected_by && (
                    <p className="text-xs text-red-400 mt-1">
                      נדחה על ידי {step.rejected_by} · {fmtDateTime(step.rejected_at)}
                    </p>
                  )}
                  {step.comments && (
                    <p className="text-xs text-muted-foreground mt-1 italic">"{step.comments}"</p>
                  )}
                  {step.escalation_hours && (
                    <p className="text-xs text-muted-foreground mt-1">
                      <Clock size={10} className="inline ml-1" />
                      הסלמה לאחר {step.escalation_hours} שעות
                    </p>
                  )}
                  {isActive && (
                    <div className="flex gap-2 mt-3">
                      <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700 text-foreground" disabled={loading} onClick={() => onApprove(step.id)}>
                        <CheckCircle2 size={12} className="ml-1" />
                        אשר
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs border-red-500/50 text-red-400 hover:bg-red-500/10" disabled={loading} onClick={() => onReject(step.id)}>
                        <XCircle size={12} className="ml-1" />
                        דחה
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
            {i < steps.length - 1 && (
              <div className="flex flex-col items-center py-1">
                <div className="w-px h-5 bg-border/40" />
                <ArrowLeft size={14} className="text-muted-foreground rotate-90" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ActionModal({ title, onSubmit, onClose, actionType }: {
  title: string;
  onSubmit: (actor: string, comments: string) => void;
  onClose: () => void;
  actionType: "approve" | "reject";
}) {
  const [actor, setActor] = useState("");
  const [comments, setComments] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold">{title}</h3>
          <Button size="icon" variant="ghost" onClick={onClose} className="h-8 w-8">
            <X size={16} />
          </Button>
        </div>
        <div className="space-y-4">
          <div>
            <Label className="text-xs mb-1 block">שם המאשר *</Label>
            <Input
              value={actor}
              onChange={e => setActor(e.target.value)}
              placeholder="הכנס שם"
              className="h-9 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs mb-1 block">הערות</Label>
            <Input
              value={comments}
              onChange={e => setComments(e.target.value)}
              placeholder="הערות אופציונליות"
              className="h-9 text-sm"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="outline" onClick={onClose} className="h-9 text-sm">ביטול</Button>
          <Button
            className={`h-9 text-sm text-foreground ${actionType === "approve" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}`}
            disabled={!actor.trim()}
            onClick={() => onSubmit(actor, comments)}
          >
            {actionType === "approve" ? <><CheckCircle2 size={14} className="ml-1" />אשר</> : <><XCircle size={14} className="ml-1" />דחה</>}
          </Button>
        </div>
      </div>
    </div>
  );
}

function PODetailPanel({ poId, onClose }: { poId: number; onClose: () => void }) {
  const [steps, setSteps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionModal, setActionModal] = useState<{ stepId: number; type: "approve" | "reject" } | null>(null);
  const [saving, setSaving] = useState(false);

  const loadSteps = async () => {
    setLoading(true);
    try {
      const res = await authFetch(`${API}/po-approval-workflow/${poId}/steps`);
      if (res.ok) setSteps(await res.json());
    } catch {}
    setLoading(false);
  };

  useEffect(() => { loadSteps(); }, [poId]);

  const handleApproveAction = async (actor: string, comments: string) => {
    if (!actionModal) return;
    setSaving(true);
    try {
      const endpoint = actionModal.type === "approve"
        ? `${API}/po-approval-workflow/${actionModal.stepId}/approve`
        : `${API}/po-approval-workflow/${actionModal.stepId}/reject`;
      const body = { comments };
      const res = await authFetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) {
        setActionModal(null);
        await loadSteps();
      } else { const e = await res.json().catch(() => ({})); alert("שגיאה: " + (e.error || e.message || "שגיאה")); }
    } catch (e: any) { alert("שגיאה: " + (e.message || "שגיאת רשת")); }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-md bg-card border-r border-border h-full overflow-y-auto shadow-2xl">
        <div className="p-4 border-b border-border flex items-center justify-between sticky top-0 bg-card z-10">
          <div className="flex items-center gap-2">
            <Button size="icon" variant="ghost" onClick={onClose} className="h-8 w-8">
              <ArrowRight size={16} />
            </Button>
            <div>
              <h3 className="font-semibold text-sm">שרשרת אישור</h3>
              <p className="text-xs text-muted-foreground">הזמנת רכש #{poId}</p>
            </div>
          </div>
        </div>
        <div className="p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="animate-spin text-muted-foreground" size={24} />
            </div>
          ) : (
            <ChainVisualization
              steps={steps}
              onApprove={stepId => setActionModal({ stepId, type: "approve" })}
              onReject={stepId => setActionModal({ stepId, type: "reject" })}
              loading={saving}
            />
          )}
        </div>
      </div>
      {actionModal && (
        <ActionModal
          title={actionModal.type === "approve" ? "אישור שלב" : "דחיית שלב"}
          actionType={actionModal.type}
          onSubmit={handleApproveAction}
          onClose={() => setActionModal(null)}
        />
      )}
    </div>
  );
}

function ThresholdConfig({ onClose }: { onClose: () => void }) {
  const [thresholds, setThresholds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newForm, setNewForm] = useState({ minAmount: "", maxAmount: "", requiredRole: "", escalationHours: "48", label: "" });

  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch(`${API}/po-approval-thresholds`);
        if (res.ok) setThresholds(await res.json());
      } catch {}
      setLoading(false);
    })();
  }, []);

  const handleDelete = async (id: number) => {
    try {
      await authFetch(`${API}/po-approval-thresholds/${id}`, { method: "DELETE" });
      setThresholds(t => t.filter(x => x.id !== id));
    } catch {}
  };

  const handleAdd = async () => {
    if (!newForm.minAmount) { alert("שדה חובה: סכום מינימלי"); return; }
    if (!newForm.requiredRole) { alert("שדה חובה: תפקיד מאשר"); return; }
    setSaving(true);
    try {
      const body = {
        minAmount: Number(newForm.minAmount),
        maxAmount: newForm.maxAmount ? Number(newForm.maxAmount) : null,
        requiredRole: newForm.requiredRole,
        escalationHours: Number(newForm.escalationHours) || 48,
        label: newForm.label,
        approverLevel: thresholds.length + 1,
      };
      const res = await authFetch(`${API}/po-approval-thresholds`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) {
        const added = await res.json();
        setThresholds(t => [...t, added]);
        setNewForm({ minAmount: "", maxAmount: "", requiredRole: "", escalationHours: "48", label: "" });
      } else { const e = await res.json().catch(() => ({})); alert("שגיאה בשמירה: " + (e.error || e.message || "שגיאה")); }
    } catch (e: any) { alert("שגיאה בשמירה: " + (e.message || "שגיאת רשת")); }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl p-6 w-full max-w-2xl mx-4 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Settings size={18} className="text-primary" />
            <h2 className="text-base font-semibold">הגדרות ספי אישור</h2>
          </div>
          <Button size="icon" variant="ghost" onClick={onClose} className="h-8 w-8">
            <X size={16} />
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="animate-spin text-muted-foreground" size={24} />
          </div>
        ) : (
          <div className="space-y-3 mb-6">
            {thresholds.map(t => (
              <div key={t.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/20 border border-border/40">
                <div className="flex-1 grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">טווח סכום</p>
                    <p className="font-medium">{fmt(t.min_amount)} – {t.max_amount ? fmt(t.max_amount) : "ללא הגבלה"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">תפקיד מאשר</p>
                    <p className="font-medium">{t.required_role === "auto" ? "אוטומטי" : t.required_role}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">הסלמה (שעות)</p>
                    <p className="font-medium">{t.escalation_hours === 0 ? "אין" : `${t.escalation_hours}ש'`}</p>
                  </div>
                </div>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-red-400 hover:text-red-300" onClick={() => handleDelete(t.id)}>
                  <Trash2 size={14} />
                </Button>
              </div>
            ))}
            {!thresholds.length && (
              <p className="text-center text-muted-foreground text-sm py-4">אין ספי אישור מוגדרים</p>
            )}
          </div>
        )}

        <div className="border-t border-border pt-4">
          <h3 className="text-sm font-medium mb-3 flex items-center gap-1">
            <Plus size={14} />
            הוסף סף אישור חדש
          </h3>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <Label className="text-xs mb-1 block">סכום מינימלי (₪) *</Label>
              <Input value={newForm.minAmount} onChange={e => setNewForm(f => ({ ...f, minAmount: e.target.value }))} placeholder="0" className="h-9 text-sm" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">סכום מקסימלי (₪)</Label>
              <Input value={newForm.maxAmount} onChange={e => setNewForm(f => ({ ...f, maxAmount: e.target.value }))} placeholder="ריק = ללא הגבלה" className="h-9 text-sm" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">תפקיד מאשר *</Label>
              <Input value={newForm.requiredRole} onChange={e => setNewForm(f => ({ ...f, requiredRole: e.target.value }))} placeholder="מנהל רכש" className="h-9 text-sm" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">שעות להסלמה</Label>
              <Input value={newForm.escalationHours} onChange={e => setNewForm(f => ({ ...f, escalationHours: e.target.value }))} placeholder="48" className="h-9 text-sm" />
            </div>
            <div className="col-span-2">
              <Label className="text-xs mb-1 block">תיאור</Label>
              <Input value={newForm.label} onChange={e => setNewForm(f => ({ ...f, label: e.target.value }))} placeholder="תיאור הסף" className="h-9 text-sm" />
            </div>
          </div>
          <Button
            className="w-full h-9 text-sm"
            disabled={saving || !newForm.minAmount || !newForm.requiredRole}
            onClick={handleAdd}
          >
            {saving ? <Loader2 size={14} className="animate-spin ml-1" /> : <Save size={14} className="ml-1" />}
            שמור סף אישור
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function PoApprovalWorkflow() {
  const [queue, setQueue] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPoId, setSelectedPoId] = useState<number | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [triggering, setTriggering] = useState<number | null>(null);
  const [triggerForm, setTriggerForm] = useState<{ poId: string; amount: string } | null>(null);

  const loadQueue = async () => {
    setLoading(true);
    try {
      const res = await authFetch(`${API}/po-approval-queue`);
      if (res.ok) setQueue(await res.json());
    } catch {}
    setLoading(false);
  };

  useEffect(() => { loadQueue(); }, []);

  const handleTrigger = async () => {
    if (!triggerForm) return;
    const poId = Number(triggerForm.poId);
    const amount = Number(triggerForm.amount);
    if (!poId || !amount) return;
    setTriggering(poId);
    try {
      const res = await authFetch(`${API}/po-approval-workflow/trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ poId, amount }),
      });
      if (res.ok) {
        const data = await res.json();
        setTriggerForm(null);
        await loadQueue();
        if (data.autoApproved) {
          alert("ההזמנה אושרה אוטומטית (מתחת לסף מינימלי)");
        }
      } else { const e = await res.json().catch(() => ({})); alert("שגיאה: " + (e.error || e.message || "שגיאה")); }
    } catch (e: any) { alert("שגיאה: " + (e.message || "שגיאת רשת")); }
    setTriggering(null);
  };

  const stats = {
    pending: queue.length,
    roles: [...new Set(queue.map((q: any) => q.required_role).filter(Boolean))],
    totalValue: queue.reduce((s: number, q: any) => s + Number(q.total_amount || 0), 0),
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-6" dir="rtl">
      <div className="max-w-5xl mx-auto space-y-5">

        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <FileCheck size={22} className="text-primary" />
              תהליך אישור הזמנות רכש
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">תור אישורים · שרשרת מדרגית · ניתוב לפי סכום</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowConfig(true)} className="h-9 text-sm gap-1">
              <Settings size={14} />
              ספי אישור
            </Button>
            <Button variant="outline" size="sm" onClick={() => setTriggerForm({ poId: "", amount: "" })} className="h-9 text-sm gap-1">
              <Plus size={14} />
              הפעל תהליך
            </Button>
            <Button size="sm" onClick={loadQueue} disabled={loading} className="h-9 text-sm gap-1">
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              רענן
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-border/50 bg-card/80">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                <Clock className="text-amber-400" size={20} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">ממתין לאישור</p>
                <p className="text-2xl font-bold">{stats.pending}</p>
                <p className="text-xs text-muted-foreground">צעדים פתוחים</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/50 bg-card/80">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                <DollarSign className="text-blue-400" size={20} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">סכום כולל בהמתנה</p>
                <p className="text-xl font-bold">{fmt(stats.totalValue)}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/50 bg-card/80">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center">
                <User className="text-purple-400" size={20} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">תפקידים מעורבים</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {stats.roles.length
                    ? stats.roles.map((r: string) => <Badge key={r} className="text-xs bg-purple-500/20 text-purple-300">{r}</Badge>)
                    : <span className="text-sm text-muted-foreground">אין</span>}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-border/50 bg-card/80">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock size={16} className="text-amber-400" />
              תור האישורים
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="animate-spin text-muted-foreground" size={28} />
              </div>
            ) : !queue.length ? (
              <div className="text-center py-12 text-muted-foreground">
                <CheckCircle2 className="mx-auto mb-3 opacity-40" size={40} />
                <p className="font-medium">אין הזמנות ממתינות לאישור</p>
                <p className="text-sm mt-1">כל ההזמנות אושרו או טרם הופעל תהליך אישור</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-right border-b border-border/40">
                      <th className="pb-2 pr-2 font-medium text-muted-foreground text-xs">מספר הזמנה</th>
                      <th className="pb-2 font-medium text-muted-foreground text-xs">ספק</th>
                      <th className="pb-2 font-medium text-muted-foreground text-xs">סכום</th>
                      <th className="pb-2 font-medium text-muted-foreground text-xs">תפקיד נדרש</th>
                      <th className="pb-2 font-medium text-muted-foreground text-xs">שלב</th>
                      <th className="pb-2 font-medium text-muted-foreground text-xs">נוצר</th>
                      <th className="pb-2 font-medium text-muted-foreground text-xs">פעולות</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/20">
                    {queue.map((item: any) => (
                      <tr key={item.id} className="hover:bg-muted/10 transition-colors">
                        <td className="py-3 pr-2">
                          <span className="font-mono text-xs bg-muted/20 px-2 py-0.5 rounded">{item.order_number || `PO-${item.po_id}`}</span>
                        </td>
                        <td className="py-3">{item.supplier_name || "-"}</td>
                        <td className="py-3 font-medium">{fmt(item.total_amount)}</td>
                        <td className="py-3">
                          <Badge className="text-xs bg-blue-500/20 text-blue-300">{item.required_role}</Badge>
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-1">
                            <div className="w-4 h-4 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-xs font-bold">
                              {item.step_order}
                            </div>
                            <span className="text-xs text-muted-foreground">מתוך {item.approver_level}</span>
                          </div>
                        </td>
                        <td className="py-3 text-xs text-muted-foreground">{fmtDate(item.created_at)}</td>
                        <td className="py-3">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1"
                            onClick={() => setSelectedPoId(Number(item.po_id))}
                          >
                            <Eye size={12} />
                            שרשרת
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {selectedPoId && (
        <PODetailPanel
          poId={selectedPoId}
          onClose={() => {
            setSelectedPoId(null);
            loadQueue();
          }}
        />
      )}

      {showConfig && <ThresholdConfig onClose={() => setShowConfig(false)} />}

      {triggerForm !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold flex items-center gap-2">
                <GitBranch size={16} className="text-primary" />
                הפעלת תהליך אישור
              </h3>
              <Button size="icon" variant="ghost" onClick={() => setTriggerForm(null)} className="h-8 w-8">
                <X size={16} />
              </Button>
            </div>
            <p className="text-sm text-muted-foreground mb-4">הפעלת תהליך אישור רב-שלבי עבור הזמנת רכש קיימת</p>
            <div className="space-y-3">
              <div>
                <Label className="text-xs mb-1 block">מספר ID של הזמנת רכש *</Label>
                <Input
                  value={triggerForm.poId}
                  onChange={e => setTriggerForm(f => f ? { ...f, poId: e.target.value } : f)}
                  placeholder="לדוגמה: 42"
                  className="h-9 text-sm"
                  type="number"
                />
              </div>
              <div>
                <Label className="text-xs mb-1 block">סכום ההזמנה (₪) *</Label>
                <Input
                  value={triggerForm.amount}
                  onChange={e => setTriggerForm(f => f ? { ...f, amount: e.target.value } : f)}
                  placeholder="לדוגמה: 25000"
                  className="h-9 text-sm"
                  type="number"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <Button variant="outline" onClick={() => setTriggerForm(null)} className="h-9 text-sm">ביטול</Button>
              <Button
                className="h-9 text-sm"
                disabled={!!triggering || !triggerForm.poId || !triggerForm.amount}
                onClick={handleTrigger}
              >
                {triggering ? <Loader2 size={14} className="animate-spin ml-1" /> : <GitBranch size={14} className="ml-1" />}
                הפעל תהליך
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
