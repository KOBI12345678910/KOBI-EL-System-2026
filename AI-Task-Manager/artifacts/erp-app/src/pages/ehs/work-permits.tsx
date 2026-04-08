import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Search, Download, Eye, Edit2, X, Save, Loader2, CheckCircle2,
  Clock, AlertCircle, Flame, Wind, Zap, Shovel, ArrowUp, ChevronRight,
  ChevronLeft, ClipboardCheck, UserCheck, CalendarDays, Trash2, LayoutGrid, List,
  AlertTriangle, Send, CalendarCheck
} from "lucide-react";
import { authFetch } from "@/lib/utils";
import { LoadingOverlay } from "@/components/ui/unified-states";

const API = "/api";
const safeArr = (d: any) => Array.isArray(d) ? d : (d?.data ?? []);

const PERMIT_TYPES: Record<string, { label: string; icon: any; color: string }> = {
  hot_work: { label: "עבודה חמה", icon: Flame, color: "text-red-400" },
  confined_space: { label: "מרחב מוגבל", icon: Wind, color: "text-yellow-400" },
  electrical_isolation: { label: "בידוד חשמלי", icon: Zap, color: "text-blue-400" },
  excavation: { label: "חפירה", icon: Shovel, color: "text-amber-400" },
  working_at_heights: { label: "עבודה בגובה", icon: ArrowUp, color: "text-purple-400" },
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  draft: { label: "טיוטה", color: "bg-gray-500/20 text-gray-300" },
  pending_approval: { label: "ממתין לאישור", color: "bg-blue-500/20 text-blue-300" },
  active: { label: "פעיל", color: "bg-green-500/20 text-green-300" },
  extended: { label: "מורחב", color: "bg-yellow-500/20 text-yellow-300" },
  closed: { label: "סגור", color: "bg-gray-500/20 text-gray-400" },
  expired: { label: "פג תוקף", color: "bg-red-500/20 text-red-300" },
};

const PPE_OPTIONS = ["כפפות", "משקפי מגן", "מסכת גז", "חלוק מעבדה", "חגורת בטיחות", "קסדה", "נשמייה", "חליפת הגנה"];

const CHECKLIST_BY_TYPE: Record<string, string[]> = {
  hot_work: ["אזור נקי מחומרים דליקים", "מטף כיבוי זמין", "מגן שריפה מוצב", "בדיקת גז עברה", "עובד כיבוי אש נוכח", "אישור מנהל אתר התקבל"],
  confined_space: ["בדיקת אוורור בוצעה", "בדיקת גזים מסוכנים", "ציוד חילוץ מוכן", "תקשורת עם שומר בחוץ", "נהלי חירום ידועים", "ציוד מגן נשימה זמין"],
  electrical_isolation: ["זיהוי כל נקודות הניתוק", "LOTO הוחל (נעל ותייג)", "בדיקת אפס מתח", "נוהל עבודה מאושר", "עובד חשמל מורשה", "ציוד הגנה חשמלית זמין"],
  excavation: ["גילוי תשתיות קיימות", "ביצוע גידור ואיתות", "בדיקת יציבות קרקע", "ציוד פינוי מוכן", "תיאום עם רשויות", "נוהל בטיחות חפירה"],
  working_at_heights: ["בדיקת ציוד עבודה בגובה", "בדיקת חגורת בטיחות", "אבטחת אזור למטה", "תנאי מזג אוויר מתאימים", "עובד מוסמך לעבודה בגובה", "ציוד חילוץ זמין"],
};

interface WorkPermit {
  id: number;
  permit_number?: string;
  permit_type: string;
  title: string;
  description?: string;
  location?: string;
  area?: string;
  requester_name?: string;
  requester_department?: string;
  requester_phone?: string;
  contractor_name?: string;
  workers_count?: number;
  planned_start?: string;
  planned_end?: string;
  actual_start?: string;
  actual_end?: string;
  status: string;
  checklist_verified?: boolean;
  checklist_data?: any;
  hazards_identified?: string;
  control_measures?: string;
  emergency_procedure?: string;
  required_ppe?: string[] | string;
  gas_test_required?: boolean;
  gas_test_result?: string;
  fire_watch_required?: boolean;
  standby_person?: string;
  isolation_points?: string;
  approved_by_safety?: string;
  approved_by_manager?: string;
  approved_at?: string;
  closed_by?: string;
  closure_notes?: string;
  notes?: string;
  created_at?: string;
  approvals?: PermitApproval[];
  approval_level?: number;
  required_approval_levels?: number;
}

interface PermitApproval {
  id: number;
  permit_id: number;
  approver_name: string;
  approver_role: string;
  approver_level: number;
  decision: string;
  comments?: string;
  approved_at?: string;
}

const parseArr = (val: any): string[] => {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === "string") {
    try { const p = JSON.parse(val); if (Array.isArray(p)) return p; } catch {}
    return val.split(",").map(s => s.trim()).filter(Boolean);
  }
  return [];
};

const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString("he-IL") : "—";
const fmtDateTime = (d?: string) => d ? new Date(d).toLocaleString("he-IL") : "—";

// ─── Close/Extend Modal ────────────────────────────────────────────────────────
function CloseExtendModal({ permit, mode, onConfirm, onClose }: {
  permit: WorkPermit;
  mode: "close" | "extend";
  onConfirm: (data: any) => Promise<void>;
  onClose: () => void;
}) {
  const [notes, setNotes] = useState("");
  const [newEnd, setNewEnd] = useState("");
  const [by, setBy] = useState("");
  const [acting, setActing] = useState(false);

  const handle = async () => {
    setActing(true);
    try {
      if (mode === "close") await onConfirm({ closed_by: by || "מנהל", closure_notes: notes });
      else await onConfirm({ new_end_date: newEnd, extended_by: by, reason: notes });
    } finally { setActing(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="p-6" dir="rtl">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-foreground">{mode === "close" ? "סגירת היתר" : "הארכת היתר"}</h3>
            <Button variant="ghost" size="sm" onClick={onClose}><X className="w-4 h-4" /></Button>
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">{mode === "close" ? "שם הסוגר" : "שם המאריך"}</label>
              <Input value={by} onChange={e => setBy(e.target.value)} className="bg-background/50 mt-1" placeholder="שם מלא" />
            </div>
            {mode === "extend" && (
              <div>
                <label className="text-xs text-muted-foreground">תאריך סיום חדש *</label>
                <Input type="datetime-local" value={newEnd} onChange={e => setNewEnd(e.target.value)} className="bg-background/50 mt-1" />
              </div>
            )}
            <div>
              <label className="text-xs text-muted-foreground">{mode === "close" ? "הערות סגירה" : "סיבת הארכה"}</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1 resize-none" />
            </div>
          </div>
          <div className="flex gap-2 mt-4 justify-end">
            <Button variant="outline" onClick={onClose}>ביטול</Button>
            <Button disabled={acting || (mode === "extend" && !newEnd)} onClick={handle}>
              {acting ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : null}
              {mode === "close" ? "סגור היתר" : "הארך היתר"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Permit Detail Modal ───────────────────────────────────────────────────────
function PermitDetailModal({ permit, onClose, onAction, approvals }: {
  permit: WorkPermit;
  onClose: () => void;
  onAction: (id: number, action: string, data?: any) => Promise<void>;
  approvals: PermitApproval[];
}) {
  const { toast } = useToast();
  const [checkItems, setCheckItems] = useState<Record<string, boolean>>(() => {
    const saved = typeof permit.checklist_data === "object" && permit.checklist_data ? permit.checklist_data : {};
    return saved;
  });
  const [approverName, setApproverName] = useState("");
  const [approverRole, setApproverRole] = useState("safety_officer");
  const [approvalComment, setApprovalComment] = useState("");
  const [rejectComment, setRejectComment] = useState("");
  const [acting, setActing] = useState(false);
  const [savingChecklist, setSavingChecklist] = useState(false);
  const [closeExtendMode, setCloseExtendMode] = useState<"close" | "extend" | null>(null);

  const checklistItems = CHECKLIST_BY_TYPE[permit.permit_type] || [];
  const allChecked = checklistItems.length === 0 || checklistItems.every(item => checkItems[item]);

  const doAction = async (action: string, data?: any) => {
    setActing(true);
    try { await onAction(permit.id, action, data); } finally { setActing(false); }
  };

  const saveChecklist = async () => {
    setSavingChecklist(true);
    try {
      await authFetch(`${API}/hse/permits/${permit.id}/checklist`, {
        method: "POST",
        body: JSON.stringify({ checklist: checkItems }),
      });
      toast({ title: "רשימת תיוג נשמרה" });
    } catch {
      toast({ title: "שגיאה בשמירת רשימת התיוג", variant: "destructive" });
    } finally { setSavingChecklist(false); }
  };

  const ppe = parseArr(permit.required_ppe);

  return (
    <>
      {closeExtendMode && (
        <CloseExtendModal
          permit={permit}
          mode={closeExtendMode}
          onClose={() => setCloseExtendMode(null)}
          onConfirm={async (data) => {
            await doAction(closeExtendMode, data);
            setCloseExtendMode(null);
          }}
        />
      )}
      <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-card border border-border rounded-xl w-full max-w-3xl max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
          <div className="p-6" dir="rtl">
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="flex items-center gap-2">
                  {(() => { const cfg = PERMIT_TYPES[permit.permit_type]; const Icon = cfg?.icon; return Icon ? <Icon className={`w-5 h-5 ${cfg.color}`} /> : null; })()}
                  <h2 className="text-xl font-bold text-foreground">{permit.title}</h2>
                </div>
                <div className="flex gap-2 mt-1">
                  {permit.permit_number && <Badge variant="outline">#{permit.permit_number}</Badge>}
                  <Badge className={STATUS_CONFIG[permit.status]?.color || "bg-gray-500/20 text-gray-300"}>
                    {STATUS_CONFIG[permit.status]?.label || permit.status}
                  </Badge>
                  <Badge className="bg-muted/50 text-foreground">{PERMIT_TYPES[permit.permit_type]?.label || permit.permit_type}</Badge>
                  {permit.checklist_verified && <Badge className="bg-green-500/20 text-green-300">✓ תיוג אושר</Badge>}
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={onClose}><X className="w-4 h-4" /></Button>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              {[
                { label: "מגיש הבקשה", val: permit.requester_name },
                { label: "מחלקה", val: permit.requester_department },
                { label: "קבלן", val: permit.contractor_name },
                { label: "מספר עובדים", val: permit.workers_count },
                { label: "מיקום", val: permit.location },
                { label: "אזור", val: permit.area },
                { label: "תחילה מתוכננת", val: fmtDateTime(permit.planned_start) },
                { label: "סיום מתוכנן", val: fmtDateTime(permit.planned_end) },
              ].map(r => r.val ? (
                <div key={r.label} className="bg-background/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">{r.label}</p>
                  <p className="text-sm font-medium text-foreground">{r.val}</p>
                </div>
              ) : null)}
            </div>

            {ppe.length > 0 && (
              <div className="mb-4">
                <p className="text-sm font-semibold text-foreground mb-2">ציוד מגן נדרש:</p>
                <div className="flex flex-wrap gap-1">{ppe.map(p => <Badge key={p} className="bg-blue-500/20 text-blue-300">{p}</Badge>)}</div>
              </div>
            )}

            {permit.hazards_identified && (
              <div className="mb-3 bg-red-900/20 border border-red-500/30 rounded-lg p-3">
                <p className="text-xs font-medium text-red-300 mb-1">סכנות מזוהות</p>
                <p className="text-sm text-foreground">{permit.hazards_identified}</p>
              </div>
            )}
            {permit.control_measures && (
              <div className="mb-3 bg-green-900/20 border border-green-500/30 rounded-lg p-3">
                <p className="text-xs font-medium text-green-300 mb-1">אמצעי בקרה</p>
                <p className="text-sm text-foreground">{permit.control_measures}</p>
              </div>
            )}

            {checklistItems.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-foreground">רשימת תיוג בטיחות:</p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{Object.values(checkItems).filter(Boolean).length}/{checklistItems.length}</span>
                    {(permit.status === "pending_approval" || permit.status === "draft") && (
                      <Button size="sm" variant="outline" onClick={saveChecklist} disabled={savingChecklist}>
                        {savingChecklist ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                      </Button>
                    )}
                  </div>
                </div>
                <div className="space-y-2 bg-background/30 rounded-lg p-3">
                  {checklistItems.map(item => (
                    <label key={item} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!checkItems[item]}
                        onChange={e => setCheckItems(p => ({ ...p, [item]: e.target.checked }))}
                        className="w-4 h-4 accent-primary"
                        disabled={permit.status !== "pending_approval" && permit.status !== "draft"}
                      />
                      <span className={`text-sm ${checkItems[item] ? "line-through text-muted-foreground" : "text-foreground"}`}>{item}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {approvals.length > 0 && (
              <div className="mb-4">
                <p className="text-sm font-semibold text-foreground mb-2">שרשרת אישורים:</p>
                <div className="space-y-2">
                  {approvals.map(a => (
                    <div key={a.id} className="flex items-center gap-3 bg-background/50 rounded-lg p-3">
                      <div className={`w-3 h-3 rounded-full flex-shrink-0 ${a.decision === "approved" ? "bg-green-400" : a.decision === "rejected" ? "bg-red-400" : "bg-gray-400"}`} />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-foreground">{a.approver_name}</p>
                        <p className="text-xs text-muted-foreground">{a.approver_role}</p>
                        {a.comments && <p className="text-xs text-foreground/70 mt-0.5">"{a.comments}"</p>}
                      </div>
                      <div className="text-left">
                        <Badge className={a.decision === "approved" ? "bg-green-500/20 text-green-300" : a.decision === "rejected" ? "bg-red-500/20 text-red-300" : "bg-gray-500/20 text-gray-300"}>
                          {a.decision === "approved" ? "מאושר" : a.decision === "rejected" ? "נדחה" : "ממתין"}
                        </Badge>
                        {a.approved_at && <p className="text-xs text-muted-foreground mt-0.5">{fmtDate(a.approved_at)}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {permit.status === "pending_approval" && (
              <div className="mb-4 bg-background/30 rounded-lg p-4 border border-border/50">
                {/* Multi-level approval progress indicator */}
                <div className="mb-3">
                  <p className="text-sm font-semibold text-foreground mb-2">שרשרת אישורים דו-שלבית:</p>
                  <div className="flex items-center gap-2">
                    {[
                      { lvl: 1, label: "ממונה בטיחות" },
                      { lvl: 2, label: "מנהל אזור" },
                    ].map(({ lvl, label }, idx) => {
                      const approved = (permit.approval_level || 0) >= lvl;
                      const isCurrent = (permit.approval_level || 0) === lvl - 1;
                      return (
                        <div key={lvl} className="flex items-center gap-1.5">
                          {idx > 0 && <ChevronLeft className="w-3 h-3 text-muted-foreground flex-shrink-0" />}
                          <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium ${
                            approved ? "bg-green-500/20 border-green-500/40 text-green-300" :
                            isCurrent ? "bg-blue-500/20 border-blue-500/60 text-blue-300 ring-1 ring-blue-500/50" :
                            "bg-background/30 border-border/30 text-muted-foreground"
                          }`}>
                            {approved ? <CheckCircle2 className="w-3 h-3" /> : isCurrent ? <Clock className="w-3 h-3" /> : <div className="w-3 h-3 rounded-full border border-current" />}
                            שלב {lvl}: {label}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-blue-300 mt-1.5">
                    {(permit.approval_level || 0) === 0
                      ? "ממתין לאישור ממונה בטיחות (שלב 1 מתוך 2)"
                      : "ממונה בטיחות אישר — ממתין לאישור מנהל אזור (שלב 2 מתוך 2)"}
                  </p>
                </div>

                <p className="text-sm font-semibold text-foreground mb-2">
                  {(permit.approval_level || 0) === 0 ? "אישור שלב 1 — ממונה בטיחות:" : "אישור שלב 2 — מנהל אזור:"}
                </p>

                {(permit.approval_level || 0) === 0 && !allChecked && (
                  <div className="flex items-center gap-2 mb-3 text-yellow-400 text-xs">
                    <AlertTriangle className="w-4 h-4" />
                    יש לסמן את כל הפריטים ברשימת התיוג לפני האישור
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 mb-2">
                  <Input placeholder="שם המאשר *" value={approverName} onChange={e => setApproverName(e.target.value)} className="bg-background/50" />
                  <select value={approverRole} onChange={e => setApproverRole(e.target.value)}
                    className="bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
                    {(permit.approval_level || 0) === 0 ? (
                      <option value="safety_officer">ממונה בטיחות (שלב 1)</option>
                    ) : (
                      <>
                        <option value="area_manager">מנהל אזור (שלב 2)</option>
                        <option value="site_manager">מנהל אתר (שלב 2)</option>
                      </>
                    )}
                  </select>
                </div>
                <Input placeholder="הערות לאישור (אופציונלי)" value={approvalComment} onChange={e => setApprovalComment(e.target.value)} className="bg-background/50 mb-2" />
                <Input placeholder="סיבת דחייה (חובה לדחייה)" value={rejectComment} onChange={e => setRejectComment(e.target.value)} className="bg-background/50 mb-3" />
                <div className="flex gap-2">
                  <Button size="sm"
                    disabled={!approverName || ((permit.approval_level || 0) === 0 && !allChecked) || acting}
                    onClick={() => doAction("approve", {
                      approver_name: approverName,
                      approver_role: approverRole,
                      comments: approvalComment,
                      checklist: (permit.approval_level || 0) === 0 ? checkItems : undefined,
                    })}>
                    {acting ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <CheckCircle2 className="w-4 h-4 ml-1 text-green-400" />}
                    {(permit.approval_level || 0) === 0 ? "אשר (שלב 1)" : "אשר והפעל היתר"}
                  </Button>
                  <Button size="sm" variant="outline" disabled={!approverName || !rejectComment || acting}
                    onClick={() => doAction("reject", { approver_name: approverName, approver_role: approverRole, comments: rejectComment })}>
                    דחה
                  </Button>
                </div>
              </div>
            )}

            {["active", "extended"].includes(permit.status) && (
              <div className="flex gap-2 mt-2">
                {permit.status === "active" && (
                  <Button size="sm" variant="outline" onClick={() => setCloseExtendMode("extend")} disabled={acting}>
                    <Clock className="w-4 h-4 ml-1" />הארכת היתר
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => setCloseExtendMode("close")} disabled={acting}>
                  סגור היתר
                </Button>
              </div>
            )}

            {permit.status === "draft" && (
              <div className="mt-3">
                <Button size="sm" onClick={() => doAction("submit")} disabled={acting}>
                  {acting ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Send className="w-4 h-4 ml-1" />}
                  שלח לאישור
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Permit Form ───────────────────────────────────────────────────────────────
function PermitForm({ initial, onSave, onClose }: {
  initial: Partial<WorkPermit>; onSave: (d: Partial<WorkPermit>) => Promise<void>; onClose: () => void;
}) {
  const [form, setForm] = useState<Partial<WorkPermit>>(initial);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof WorkPermit, v: any) => setForm(f => ({ ...f, [k]: v }));
  const togglePPE = (p: string) => {
    const arr = parseArr(form.required_ppe);
    set("required_ppe", arr.includes(p) ? arr.filter(x => x !== p) : [...arr, p]);
  };
  const handleSave = async () => {
    if (!form.title?.trim() || !form.permit_type) return;
    setSaving(true);
    try {
      await onSave({ ...form, required_ppe: parseArr(form.required_ppe) });
    } finally { setSaving(false); }
  };
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl w-full max-w-2xl max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="p-6" dir="rtl">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold text-foreground">{initial.id ? "עריכת היתר" : "בקשת היתר עבודה חדש"}</h2>
            <Button variant="ghost" size="sm" onClick={onClose}><X className="w-4 h-4" /></Button>
          </div>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground">כותרת *</label>
                <Input value={form.title || ""} onChange={e => set("title", e.target.value)} className="bg-background/50 mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">סוג היתר *</label>
                <select value={form.permit_type || "hot_work"} onChange={e => set("permit_type", e.target.value)}
                  className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                  {Object.entries(PERMIT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">סטטוס</label>
                <select value={form.status || "draft"} onChange={e => set("status", e.target.value)}
                  className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                  {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">שם המגיש</label>
                <Input value={form.requester_name || ""} onChange={e => set("requester_name", e.target.value)} className="bg-background/50 mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">מחלקה</label>
                <Input value={form.requester_department || ""} onChange={e => set("requester_department", e.target.value)} className="bg-background/50 mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">קבלן</label>
                <Input value={form.contractor_name || ""} onChange={e => set("contractor_name", e.target.value)} className="bg-background/50 mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">מספר עובדים</label>
                <Input type="number" value={form.workers_count || 1} onChange={e => set("workers_count", parseInt(e.target.value))} className="bg-background/50 mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">מיקום</label>
                <Input value={form.location || ""} onChange={e => set("location", e.target.value)} className="bg-background/50 mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">אזור</label>
                <Input value={form.area || ""} onChange={e => set("area", e.target.value)} className="bg-background/50 mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">תאריך ושעת תחילה</label>
                <Input type="datetime-local" value={form.planned_start?.slice(0, 16) || ""} onChange={e => set("planned_start", e.target.value)} className="bg-background/50 mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">תאריך ושעת סיום</label>
                <Input type="datetime-local" value={form.planned_end?.slice(0, 16) || ""} onChange={e => set("planned_end", e.target.value)} className="bg-background/50 mt-1" />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">ציוד מגן נדרש (PPE)</label>
              <div className="flex flex-wrap gap-1 mt-1">
                {PPE_OPTIONS.map(p => {
                  const sel = parseArr(form.required_ppe).includes(p);
                  return (
                    <button key={p} type="button" onClick={() => togglePPE(p)}
                      className={`px-2 py-1 rounded text-xs border transition-colors ${sel ? "bg-blue-500/30 border-blue-500 text-blue-200" : "bg-background/50 border-border text-muted-foreground"}`}>
                      {p}
                    </button>
                  );
                })}
              </div>
            </div>
            {([
              { key: "description", label: "תיאור העבודה" },
              { key: "hazards_identified", label: "סכנות מזוהות" },
              { key: "control_measures", label: "אמצעי בקרה" },
              { key: "emergency_procedure", label: "נוהל חירום" },
              { key: "isolation_points", label: "נקודות בידוד" },
              { key: "notes", label: "הערות" },
            ] as { key: keyof WorkPermit; label: string }[]).map(f => (
              <div key={f.key}>
                <label className="text-xs text-muted-foreground">{f.label}</label>
                <textarea value={(form as any)[f.key] || ""} onChange={e => set(f.key, e.target.value)}
                  rows={2} className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1 resize-none" />
              </div>
            ))}
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="checkbox" checked={!!form.gas_test_required} onChange={e => set("gas_test_required", e.target.checked)} className="accent-primary" />
                בדיקת גז נדרשת
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="checkbox" checked={!!form.fire_watch_required} onChange={e => set("fire_watch_required", e.target.checked)} className="accent-primary" />
                שמירת אש נדרשת
              </label>
            </div>
          </div>
          <div className="flex gap-2 mt-4 justify-end">
            <Button variant="outline" onClick={onClose}>ביטול</Button>
            <Button onClick={handleSave} disabled={saving || !form.title?.trim()}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Save className="w-4 h-4 ml-1" />}שמירה
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Board View ────────────────────────────────────────────────────────────────
function BoardView({ onView }: { onView: (p: WorkPermit) => void }) {
  const [board, setBoard] = useState<Record<string, WorkPermit[]>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(`${API}/hse/permits/active-board`);
      const json = await res.json();
      setBoard(json.board || {});
    } catch {
      setBoard({});
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <LoadingOverlay className="min-h-[200px]" />;

  const areas = Object.keys(board);
  if (areas.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <LayoutGrid className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p className="text-lg font-medium">אין היתרים פעילים כרגע</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-4 min-w-max pb-4">
        {areas.map(area => (
          <div key={area} className="w-72 flex-shrink-0">
            <div className="bg-background/60 rounded-lg p-2 mb-3 text-sm font-semibold text-foreground border border-border/50 flex items-center justify-between">
              <span>{area}</span>
              <Badge className="bg-primary/20 text-primary-foreground">{board[area].length}</Badge>
            </div>
            <div className="space-y-2">
              {board[area].map(permit => {
                const typeCfg = PERMIT_TYPES[permit.permit_type];
                const Icon = typeCfg?.icon;
                const isExpiring = permit.planned_end && new Date(permit.planned_end) < new Date(Date.now() + 4 * 60 * 60 * 1000);
                return (
                  <div key={permit.id}
                    className="bg-card border border-border/50 rounded-lg p-3 cursor-pointer hover:border-primary/50 transition-colors"
                    onClick={() => onView(permit)}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        {Icon && <Icon className={`w-4 h-4 ${typeCfg.color} flex-shrink-0`} />}
                        <p className="text-sm font-medium text-foreground leading-tight">{permit.title}</p>
                      </div>
                      <Badge className={`text-[10px] flex-shrink-0 ${STATUS_CONFIG[permit.status]?.color}`}>
                        {STATUS_CONFIG[permit.status]?.label}
                      </Badge>
                    </div>
                    {permit.requester_name && <p className="text-xs text-muted-foreground mt-1">{permit.requester_name}</p>}
                    {permit.planned_end && (
                      <div className={`flex items-center gap-1 mt-1.5 text-xs ${isExpiring ? "text-red-400" : "text-muted-foreground"}`}>
                        <CalendarCheck className="w-3 h-3" />
                        {fmtDateTime(permit.planned_end)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function WorkPermits() {
  const { toast } = useToast();
  const [permits, setPermits] = useState<WorkPermit[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [viewPermit, setViewPermit] = useState<WorkPermit | null>(null);
  const [editPermit, setEditPermit] = useState<Partial<WorkPermit> | null>(null);
  const [approvals, setApprovals] = useState<PermitApproval[]>([]);
  const [viewMode, setViewMode] = useState<"list" | "board">("list");
  const perPage = 25;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(perPage), is_active: "true" });
      if (search) params.set("search", search);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (typeFilter !== "all") params.set("permit_type", typeFilter);
      const res = await authFetch(`${API}/hse-work-permits?${params}`);
      const json = await res.json();
      setPermits(safeArr(json));
      setTotal(json.pagination?.total ?? 0);
      setTotalPages(json.pagination?.totalPages ?? 1);
    } catch { toast({ title: "שגיאה", description: "שגיאה בטעינת נתונים", variant: "destructive" }); }
    finally { setLoading(false); }
  }, [page, search, typeFilter, statusFilter, toast]);

  useEffect(() => { load(); }, [load]);

  const loadApprovals = async (permitId: number) => {
    try {
      const res = await authFetch(`${API}/hse-permit-approvals?permit_id=${permitId}`);
      const json = await res.json();
      setApprovals(safeArr(json));
    } catch { setApprovals([]); }
  };

  const handleView = async (permit: WorkPermit) => {
    setViewPermit(permit);
    await loadApprovals(permit.id);
  };

  const handleSave = async (data: Partial<WorkPermit>) => {
    const url = data.id ? `${API}/hse-work-permits/${data.id}` : `${API}/hse-work-permits`;
    const method = data.id ? "PUT" : "POST";
    if (!data.id && !data.permit_number) {
      data.permit_number = `PTW-${Date.now().toString().slice(-6)}`;
    }
    const res = await authFetch(url, { method, body: JSON.stringify(data) });
    if (!res.ok) throw new Error("שגיאה בשמירה");
    toast({ title: "נשמר בהצלחה" });
    setEditPermit(null);
    load();
  };

  const handleAction = async (id: number, action: string, data?: any) => {
    try {
      let res: Response;
      if (action === "approve") {
        res = await authFetch(`${API}/hse/permits/${id}/approve`, { method: "POST", body: JSON.stringify(data) });
      } else if (action === "reject") {
        res = await authFetch(`${API}/hse/permits/${id}/reject`, { method: "POST", body: JSON.stringify(data) });
      } else if (action === "submit") {
        res = await authFetch(`${API}/hse/permits/${id}/submit`, { method: "POST" });
      } else if (action === "extend") {
        res = await authFetch(`${API}/hse/permits/${id}/extend`, { method: "POST", body: JSON.stringify(data) });
      } else if (action === "close") {
        res = await authFetch(`${API}/hse/permits/${id}/close`, { method: "POST", body: JSON.stringify(data) });
      } else {
        return;
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({ title: "שגיאה", description: err.error || "פעולה נכשלה", variant: "destructive" });
        return;
      }

      const labels: Record<string, string> = { approve: "אושר", reject: "נדחה", submit: "נשלח לאישור", extend: "הוארך", close: "נסגר" };
      toast({ title: `היתר ${labels[action] || "עודכן"} בהצלחה` });
      setViewPermit(null);
      load();
    } catch {
      toast({ title: "שגיאה בביצוע פעולה", variant: "destructive" });
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("האם למחוק היתר זה?")) return;
    await authFetch(`${API}/hse-work-permits/${id}`, { method: "DELETE" });
    toast({ title: "נמחק" });
    load();
  };

  const handleSubmit = async (permit: WorkPermit) => {
    const res = await authFetch(`${API}/hse/permits/${permit.id}/submit`, { method: "POST" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast({ title: "שגיאה", description: err.error || "שליחה נכשלה", variant: "destructive" });
      return;
    }
    toast({ title: "היתר נשלח לאישור" });
    load();
  };

  const statusCounts = Object.keys(STATUS_CONFIG).reduce((acc, s) => {
    acc[s] = permits.filter(p => p.status === s).length;
    return acc;
  }, {} as Record<string, number>);

  const pendingCount = permits.filter(p => p.status === "pending_approval").length;

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {viewPermit && (
        <PermitDetailModal permit={viewPermit} approvals={approvals}
          onClose={() => setViewPermit(null)} onAction={handleAction} />
      )}
      {editPermit && (
        <PermitForm initial={editPermit} onSave={handleSave} onClose={() => setEditPermit(null)} />
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ClipboardCheck className="w-7 h-7 text-primary" />
            היתרי עבודה
          </h1>
          <p className="text-sm text-muted-foreground mt-1">עבודה חמה, מרחב מוגבל, בידוד חשמלי, חפירה ועבודה בגובה</p>
        </div>
        <div className="flex gap-2 items-center">
          {pendingCount > 0 && (
            <Badge className="bg-blue-500/20 text-blue-300 border border-blue-500/30">
              {pendingCount} ממתין לאישור
            </Badge>
          )}
          <div className="flex border border-border/50 rounded-md overflow-hidden">
            <Button variant={viewMode === "list" ? "default" : "ghost"} size="sm" onClick={() => setViewMode("list")} className="rounded-none">
              <List className="w-4 h-4" />
            </Button>
            <Button variant={viewMode === "board" ? "default" : "ghost"} size="sm" onClick={() => setViewMode("board")} className="rounded-none">
              <LayoutGrid className="w-4 h-4" />
            </Button>
          </div>
          <Button size="sm" onClick={() => setEditPermit({ permit_type: "hot_work", status: "draft", workers_count: 1 })}>
            <Plus className="w-4 h-4 ml-1" />בקשת היתר
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
          <Card key={key} className={`bg-card/50 border-border/50 cursor-pointer transition-colors ${statusFilter === key ? "border-primary/70" : "hover:border-primary/30"}`}
            onClick={() => setStatusFilter(statusFilter === key ? "all" : key)}>
            <CardContent className="p-3 text-center">
              <div className="text-xl font-bold text-foreground">{statusCounts[key] ?? 0}</div>
              <Badge className={`mt-1 text-[10px] ${cfg.color}`}>{cfg.label}</Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {Object.entries(PERMIT_TYPES).map(([key, cfg]) => {
          const Icon = cfg.icon;
          const count = permits.filter(p => p.permit_type === key).length;
          return (
            <Card key={key} className={`bg-card/50 border-border/50 cursor-pointer transition-colors ${typeFilter === key ? "border-primary/70" : "hover:border-primary/30"}`}
              onClick={() => setTypeFilter(typeFilter === key ? "all" : key)}>
              <CardContent className="p-3 flex items-center gap-2">
                <Icon className={`w-5 h-5 ${cfg.color}`} />
                <div>
                  <div className="text-sm font-bold text-foreground">{count}</div>
                  <div className="text-[10px] text-muted-foreground">{cfg.label}</div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="bg-card/50 border-border/50">
        <CardContent className="p-4">
          {viewMode === "board" ? (
            <BoardView onView={handleView} />
          ) : (
            <>
              <div className="flex flex-wrap gap-3 mb-4">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="חיפוש..." value={search}
                    onChange={e => { setSearch(e.target.value); setPage(1); }}
                    className="pr-9 bg-background/50" />
                </div>
                <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
                  className="bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
                  <option value="all">כל הסטטוסים</option>
                  {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }}
                  className="bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
                  <option value="all">כל הסוגים</option>
                  {Object.entries(PERMIT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>

              {loading ? (
                <LoadingOverlay className="min-h-[200px]" />
              ) : permits.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <ClipboardCheck className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="text-lg font-medium">אין היתרי עבודה</p>
                  <p className="text-sm mt-1">לחץ על "בקשת היתר" כדי להתחיל</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50">
                        {["סוג", "כותרת", "מגיש", "מיקום", "תקף עד", "סטטוס", "תיוג"].map(l => (
                          <th key={l} className="text-right p-3 text-muted-foreground font-medium">{l}</th>
                        ))}
                        <th className="text-center p-3 text-muted-foreground font-medium">פעולות</th>
                      </tr>
                    </thead>
                    <tbody>
                      {permits.map(permit => {
                        const typeCfg = PERMIT_TYPES[permit.permit_type];
                        const Icon = typeCfg?.icon;
                        const statusCfg = STATUS_CONFIG[permit.status];
                        const isExpired = permit.planned_end && new Date(permit.planned_end) < new Date() && permit.status === "active";
                        const isExpiringSoon = permit.planned_end && new Date(permit.planned_end) < new Date(Date.now() + 24 * 60 * 60 * 1000) && permit.status === "active";
                        return (
                          <tr key={permit.id} className="border-b border-border/30 hover:bg-card/30 transition-colors">
                            <td className="p-3">
                              <div className="flex items-center gap-1">
                                {Icon && <Icon className={`w-4 h-4 ${typeCfg.color}`} />}
                                <span className="text-xs text-muted-foreground">{typeCfg?.label}</span>
                              </div>
                            </td>
                            <td className="p-3">
                              <div className="font-medium text-foreground">{permit.title}</div>
                              {permit.permit_number && <div className="text-xs text-muted-foreground">#{permit.permit_number}</div>}
                            </td>
                            <td className="p-3 text-foreground">{permit.requester_name || "—"}</td>
                            <td className="p-3 text-foreground">{permit.location || "—"}</td>
                            <td className="p-3">
                              <span className={isExpired ? "text-red-400" : isExpiringSoon ? "text-yellow-400" : "text-foreground"}>
                                {fmtDate(permit.planned_end)}
                              </span>
                            </td>
                            <td className="p-3">
                              <Badge className={statusCfg?.color || "bg-gray-500/20 text-gray-300"}>
                                {statusCfg?.label || permit.status}
                              </Badge>
                            </td>
                            <td className="p-3">
                              {permit.checklist_verified
                                ? <CheckCircle2 className="w-4 h-4 text-green-400" />
                                : <AlertCircle className="w-4 h-4 text-muted-foreground/50" />}
                            </td>
                            <td className="p-3">
                              <div className="flex items-center justify-center gap-1">
                                <Button variant="ghost" size="sm" onClick={() => handleView(permit)} title="פרטים">
                                  <Eye className="w-3.5 h-3.5" />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => setEditPermit(permit)} title="עריכה">
                                  <Edit2 className="w-3.5 h-3.5" />
                                </Button>
                                {permit.status === "draft" && (
                                  <Button variant="ghost" size="sm" onClick={() => handleSubmit(permit)} title="שלח לאישור">
                                    <Send className="w-3.5 h-3.5 text-blue-400" />
                                  </Button>
                                )}
                                <Button variant="ghost" size="sm" onClick={() => handleDelete(permit.id)} title="מחיקה">
                                  <Trash2 className="w-3.5 h-3.5 text-red-400" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
                <span>סה"כ {total} היתרים</span>
                <div className="flex gap-1 items-center">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                  <span className="px-3 py-1">{page} / {totalPages}</span>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
