import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Plus, Search, Edit2, Trash2, Eye, X, Save, CheckCircle2, Clock, AlertCircle,
  Loader2, FileText, Send, ThumbsUp, ThumbsDown, Globe, History, Users,
  User, Building2, Calendar, ChevronRight, ArrowUpRight, FilePlus, ShieldCheck
} from "lucide-react";
import { authFetch } from "@/lib/utils";

const API = "/api";
const h = () => ({ Authorization: `Bearer ${localStorage.getItem("erp_token") || ""}`, "Content-Type": "application/json" });

// ── Types ──────────────────────────────────────────────
type QDoc = {
  id: number; documentNumber: string; title: string; documentType: string; category: string;
  description: string; content: string; version: number; revisionLabel: string;
  status: string; isoStandard: string; department: string; owner: string; author: string;
  effectiveDate: string; reviewDate: string; expiryDate: string; changeSummary: string;
  approvalSteps: number; approvedSteps: number; distributionCount: number; acknowledgedCount: number;
  createdAt: string;
};

type Approval = {
  id: number; stepOrder: number; approverName: string; approverRole: string;
  status: string; comments: string; actedAt: string;
};

type Distribution = {
  id: number; recipientName: string; recipientEmail: string; recipientDepartment: string;
  sentAt: string; acknowledgedAt: string; acknowledgmentNotes: string;
};

type Revision = {
  id: number; version: number; revisionLabel: string; title: string;
  changeSummary: string; changedBy: string; status: string; createdAt: string;
};

type DocDetail = QDoc & { approvals: Approval[]; distribution: Distribution[]; revisions: Revision[] };

// ── Helpers ──────────────────────────────────────────────
function mapDoc(r: any): QDoc {
  return {
    id: r.id, documentNumber: r.document_number || "", title: r.title || "",
    documentType: r.document_type || "procedure", category: r.category || "",
    description: r.description || "", content: r.content || "",
    version: r.version || 1, revisionLabel: r.revision_label || "A",
    status: r.status || "draft", isoStandard: r.iso_standard || "",
    department: r.department || "", owner: r.owner || "", author: r.author || "",
    effectiveDate: r.effective_date || "", reviewDate: r.review_date || "",
    expiryDate: r.expiry_date || "", changeSummary: r.change_summary || "",
    approvalSteps: parseInt(r.approval_steps) || 0,
    approvedSteps: parseInt(r.approved_steps) || 0,
    distributionCount: parseInt(r.distribution_count) || 0,
    acknowledgedCount: parseInt(r.acknowledged_count) || 0,
    createdAt: r.created_at || "",
  };
}

function mapApproval(r: any): Approval {
  return {
    id: r.id, stepOrder: r.step_order || 1, approverName: r.approver_name || "",
    approverRole: r.approver_role || "", status: r.status || "pending",
    comments: r.comments || "", actedAt: r.acted_at || "",
  };
}

function mapDistribution(r: any): Distribution {
  return {
    id: r.id, recipientName: r.recipient_name || "", recipientEmail: r.recipient_email || "",
    recipientDepartment: r.recipient_department || "", sentAt: r.sent_at || "",
    acknowledgedAt: r.acknowledged_at || "", acknowledgmentNotes: r.acknowledgment_notes || "",
  };
}

function mapRevision(r: any): Revision {
  return {
    id: r.id, version: r.version || 1, revisionLabel: r.revision_label || "A",
    title: r.title || "", changeSummary: r.change_summary || "",
    changedBy: r.changed_by || "", status: r.status || "draft",
    createdAt: r.created_at || "",
  };
}

const STATUS_MAP: Record<string, { label: string; color: string; icon: any }> = {
  draft: { label: "טיוטה", color: "bg-muted/50 text-muted-foreground", icon: Clock },
  in_review: { label: "בסקירה", color: "bg-blue-500/20 text-blue-300", icon: Eye },
  approved: { label: "מאושר", color: "bg-green-500/20 text-green-300", icon: CheckCircle2 },
  rejected: { label: "נדחה", color: "bg-red-500/20 text-red-300", icon: AlertCircle },
  published: { label: "פורסם", color: "bg-cyan-500/20 text-cyan-300", icon: Globe },
  superseded: { label: "הוחלף", color: "bg-gray-500/20 text-gray-400", icon: History },
};

const APPROVAL_STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: "ממתין", color: "bg-yellow-500/20 text-yellow-300" },
  approved: { label: "אושר", color: "bg-green-500/20 text-green-300" },
  rejected: { label: "נדחה", color: "bg-red-500/20 text-red-300" },
};

const DOC_TYPES = [
  { value: "procedure", label: "נוהל" },
  { value: "work_instruction", label: "הוראת עבודה" },
  { value: "form", label: "טופס" },
  { value: "policy", label: "מדיניות" },
  { value: "specification", label: "מפרט" },
  { value: "record", label: "רשומה" },
];

const DOC_TYPE_HE: Record<string, string> = { procedure: "נוהל", work_instruction: "הוראת עבודה", form: "טופס", policy: "מדיניות", specification: "מפרט", record: "רשומה" };

// ── Modal wrapper ──────────────────────────────────────────────
function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className={`bg-card border border-border rounded-2xl shadow-2xl w-full ${wide ? "max-w-4xl" : "max-w-2xl"} max-h-[90vh] overflow-y-auto`} onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center p-6 border-b border-border/50">
          <h2 className="text-xl font-bold text-foreground">{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose}><X className="w-5 h-5" /></Button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

// ── Document Detail Panel ──────────────────────────────────────────────
function DocumentDetail({ docId, onClose, onRefresh }: { docId: number; onClose: () => void; onRefresh: () => void }) {
  const [doc, setDoc] = useState<DocDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"info" | "approvals" | "distribution" | "revisions">("info");
  const [addApproverForm, setAddApproverForm] = useState(false);
  const [approverForm, setApproverForm] = useState<{ approverName: string; approverRole: string; stepOrder: number }>({ approverName: "", approverRole: "", stepOrder: 1 });
  const [addDistForm, setAddDistForm] = useState(false);
  const [distForm, setDistForm] = useState<{ recipientName: string; recipientEmail: string; recipientDepartment: string }>({ recipientName: "", recipientEmail: "", recipientDepartment: "" });
  const [saving, setSaving] = useState(false);
  const [actionComment, setActionComment] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await authFetch(`${API}/quality/documents/${docId}`, { headers: h() });
      const data = await r.json();
      setDoc({
        ...mapDoc(data),
        approvals: Array.isArray(data.approvals) ? data.approvals.map(mapApproval) : [],
        distribution: Array.isArray(data.distribution) ? data.distribution.map(mapDistribution) : [],
        revisions: Array.isArray(data.revisions) ? data.revisions.map(mapRevision) : [],
      });
    } catch { setDoc(null); }
    setLoading(false);
  }, [docId]);

  useEffect(() => { load(); }, [load]);

  const submitForReview = async () => {
    await authFetch(`${API}/quality/documents/${docId}/submit`, { method: "POST", headers: h(), body: JSON.stringify({}) });
    onRefresh();
    load();
  };

  const publishDoc = async () => {
    await authFetch(`${API}/quality/documents/${docId}/publish`, { method: "POST", headers: h(), body: JSON.stringify({ effectiveDate: new Date().toISOString().split("T")[0] }) });
    onRefresh();
    load();
  };

  const actOnApproval = async (approvalId: number, status: "approved" | "rejected") => {
    setSaving(true);
    await authFetch(`${API}/quality/documents/${docId}/approvals/${approvalId}`, {
      method: "PUT", headers: h(), body: JSON.stringify({ status, comments: actionComment }),
    });
    setActionComment("");
    onRefresh();
    load();
    setSaving(false);
  };

  const addApprover = async () => {
    setSaving(true);
    await authFetch(`${API}/quality/documents/${docId}/approvals`, {
      method: "POST", headers: h(), body: JSON.stringify(approverForm),
    });
    setAddApproverForm(false);
    load();
    setSaving(false);
  };

  const addDistribution = async () => {
    setSaving(true);
    await authFetch(`${API}/quality/documents/${docId}/distribution`, {
      method: "POST", headers: h(), body: JSON.stringify(distForm),
    });
    setAddDistForm(false);
    load();
    setSaving(false);
  };

  const acknowledge = async (distId: number) => {
    await authFetch(`${API}/quality/documents/${docId}/distribution/${distId}/acknowledge`, {
      method: "POST", headers: h(), body: JSON.stringify({ notes: "" }),
    });
    load();
  };

  if (loading) return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-card border border-border rounded-2xl p-8">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    </div>
  );

  if (!doc) return null;

  const status = STATUS_MAP[doc.status] || { label: doc.status, color: "bg-gray-500/20 text-gray-300", icon: FileText };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-start justify-end z-50 p-4 pt-16" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl h-full max-h-[85vh] overflow-y-auto flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start p-6 border-b border-border/50">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-xs text-muted-foreground">{doc.documentNumber}</span>
              <Badge className={status.color}>{status.label}</Badge>
              <Badge variant="outline" className="text-xs">Rev {doc.revisionLabel}</Badge>
            </div>
            <h2 className="text-lg font-bold text-foreground">{doc.title}</h2>
            <div className="flex gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
              <span>{DOC_TYPE_HE[doc.documentType] || doc.documentType}</span>
              {doc.isoStandard && <span>{doc.isoStandard}</span>}
              {doc.department && <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{doc.department}</span>}
              {doc.owner && <span className="flex items-center gap-1"><User className="w-3 h-3" />{doc.owner}</span>}
            </div>
          </div>
          <div className="flex gap-2">
            {doc.status === "draft" && (
              <Button size="sm" variant="outline" onClick={submitForReview} className="text-blue-400 border-blue-400/30">
                <Send className="w-3.5 h-3.5 ml-1" />שלח לסקירה
              </Button>
            )}
            {doc.status === "approved" && (
              <Button size="sm" onClick={publishDoc} className="bg-cyan-600 hover:bg-cyan-700">
                <Globe className="w-3.5 h-3.5 ml-1" />פרסם
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onClose}><X className="w-5 h-5" /></Button>
          </div>
        </div>

        <div className="flex border-b border-border/50 px-6">
          {[
            { key: "info", label: "מידע" },
            { key: "approvals", label: `אישורים (${doc.approvals.length})` },
            { key: "distribution", label: `הפצה (${doc.distribution.length})` },
            { key: "revisions", label: `גרסאות (${doc.revisions.length})` },
          ].map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key as any)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${activeTab === t.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-6 flex-1">
          {activeTab === "info" && (
            <div className="space-y-4">
              {doc.description && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-1">תיאור</h4>
                  <p className="text-sm text-foreground">{doc.description}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 text-sm">
                {doc.author && <div><span className="text-muted-foreground">מחבר: </span><span className="text-foreground">{doc.author}</span></div>}
                {doc.effectiveDate && <div><span className="text-muted-foreground">כניסה לתוקף: </span><span className="text-foreground">{doc.effectiveDate}</span></div>}
                {doc.reviewDate && <div><span className="text-muted-foreground">סקירה: </span><span className="text-foreground">{doc.reviewDate}</span></div>}
                {doc.expiryDate && <div><span className="text-muted-foreground">תוקף עד: </span><span className="text-foreground">{doc.expiryDate}</span></div>}
                <div><span className="text-muted-foreground">גרסה: </span><span className="text-foreground">{doc.version} (Rev {doc.revisionLabel})</span></div>
                {doc.approvalSteps > 0 && (
                  <div><span className="text-muted-foreground">אישורים: </span><span className={doc.approvedSteps === doc.approvalSteps ? "text-green-400" : "text-yellow-400"}>{doc.approvedSteps}/{doc.approvalSteps}</span></div>
                )}
              </div>
              {doc.content && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-1">תוכן</h4>
                  <div className="text-sm text-foreground bg-background/30 rounded-lg p-3 whitespace-pre-wrap border border-border/30">{doc.content}</div>
                </div>
              )}
            </div>
          )}

          {activeTab === "approvals" && (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <h4 className="text-sm font-medium text-muted-foreground">שלבי אישור</h4>
                <Button size="sm" variant="outline" onClick={() => setAddApproverForm(true)}>
                  <Plus className="w-3.5 h-3.5 ml-1" />הוסף מאשר
                </Button>
              </div>
              {addApproverForm && (
                <div className="p-4 bg-background/30 rounded-lg border border-border/30 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="block text-xs text-muted-foreground mb-1">שם המאשר</label>
                      <Input value={approverForm.approverName} onChange={e => setApproverForm({ ...approverForm, approverName: e.target.value })} className="bg-background/50 h-8 text-sm" /></div>
                    <div><label className="block text-xs text-muted-foreground mb-1">תפקיד</label>
                      <Input value={approverForm.approverRole} onChange={e => setApproverForm({ ...approverForm, approverRole: e.target.value })} className="bg-background/50 h-8 text-sm" /></div>
                    <div><label className="block text-xs text-muted-foreground mb-1">סדר שלב</label>
                      <Input type="number" min="1" value={approverForm.stepOrder} onChange={e => setApproverForm({ ...approverForm, stepOrder: parseInt(e.target.value) || 1 })} className="bg-background/50 h-8 text-sm" /></div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={addApprover} disabled={saving} className="bg-primary">הוסף</Button>
                    <Button size="sm" variant="outline" onClick={() => setAddApproverForm(false)}>ביטול</Button>
                  </div>
                </div>
              )}
              {doc.approvals.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">אין שלבי אישור</p>
              ) : (
                <div className="space-y-2">
                  {doc.approvals.sort((a, b) => a.stepOrder - b.stepOrder).map(approval => {
                    const as = APPROVAL_STATUS_MAP[approval.status] || { label: approval.status, color: "bg-gray-500/20 text-gray-300" };
                    return (
                      <div key={approval.id} className="p-3 bg-background/30 rounded-lg border border-border/30">
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">שלב {approval.stepOrder}</span>
                              <span className="text-sm font-medium text-foreground">{approval.approverName}</span>
                              {approval.approverRole && <span className="text-xs text-muted-foreground">— {approval.approverRole}</span>}
                            </div>
                            {approval.comments && <p className="text-xs text-muted-foreground mt-1">{approval.comments}</p>}
                            {approval.actedAt && <p className="text-xs text-muted-foreground">{new Date(approval.actedAt).toLocaleDateString("he-IL")}</p>}
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className={as.color}>{as.label}</Badge>
                            {approval.status === "pending" && doc.status === "in_review" && (
                              <div className="flex gap-1">
                                <Button size="sm" variant="ghost" className="text-green-400 hover:text-green-300 h-7" onClick={() => actOnApproval(approval.id, "approved")}>
                                  <ThumbsUp className="w-3.5 h-3.5" />
                                </Button>
                                <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-300 h-7" onClick={() => actOnApproval(approval.id, "rejected")}>
                                  <ThumbsDown className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === "distribution" && (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <h4 className="text-sm font-medium text-muted-foreground">רשימת הפצה</h4>
                <Button size="sm" variant="outline" onClick={() => setAddDistForm(true)}>
                  <Plus className="w-3.5 h-3.5 ml-1" />הוסף נמען
                </Button>
              </div>
              {addDistForm && (
                <div className="p-4 bg-background/30 rounded-lg border border-border/30 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="block text-xs text-muted-foreground mb-1">שם *</label>
                      <Input value={distForm.recipientName} onChange={e => setDistForm({ ...distForm, recipientName: e.target.value })} className="bg-background/50 h-8 text-sm" /></div>
                    <div><label className="block text-xs text-muted-foreground mb-1">אימייל</label>
                      <Input type="email" value={distForm.recipientEmail} onChange={e => setDistForm({ ...distForm, recipientEmail: e.target.value })} className="bg-background/50 h-8 text-sm" /></div>
                    <div><label className="block text-xs text-muted-foreground mb-1">מחלקה</label>
                      <Input value={distForm.recipientDepartment} onChange={e => setDistForm({ ...distForm, recipientDepartment: e.target.value })} className="bg-background/50 h-8 text-sm" /></div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={addDistribution} disabled={saving} className="bg-primary">שלח</Button>
                    <Button size="sm" variant="outline" onClick={() => setAddDistForm(false)}>ביטול</Button>
                  </div>
                </div>
              )}
              {doc.distribution.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">אין רשומות הפצה</p>
              ) : (
                <div className="space-y-2">
                  {doc.distribution.map(d => (
                    <div key={d.id} className="p-3 bg-background/30 rounded-lg border border-border/30 flex justify-between items-center">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">{d.recipientName}</span>
                          {d.recipientDepartment && <span className="text-xs text-muted-foreground">— {d.recipientDepartment}</span>}
                        </div>
                        {d.recipientEmail && <p className="text-xs text-muted-foreground">{d.recipientEmail}</p>}
                        <p className="text-xs text-muted-foreground">נשלח: {new Date(d.sentAt).toLocaleDateString("he-IL")}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {d.acknowledgedAt ? (
                          <Badge className="bg-green-500/20 text-green-300 text-xs flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />אושר
                          </Badge>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => acknowledge(d.id)} className="text-xs h-7">
                            אשר קבלה
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {doc.distributionCount > 0 && (
                <div className="text-xs text-muted-foreground pt-2 border-t border-border/30">
                  {doc.acknowledgedCount}/{doc.distributionCount} אישרו קבלה
                </div>
              )}
            </div>
          )}

          {activeTab === "revisions" && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground mb-3">היסטוריית גרסאות</h4>
              {doc.revisions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">אין גרסאות קודמות</p>
              ) : (
                doc.revisions.map((rev, i) => (
                  <div key={rev.id} className={`p-3 rounded-lg border ${i === 0 ? "border-primary/50 bg-primary/5" : "border-border/30 bg-background/20"}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">Rev {rev.revisionLabel}</Badge>
                        <span className="text-sm font-medium text-foreground">גרסה {rev.version}</span>
                        {STATUS_MAP[rev.status] && <Badge className={`${STATUS_MAP[rev.status].color} text-xs`}>{STATUS_MAP[rev.status].label}</Badge>}
                      </div>
                      <span className="text-xs text-muted-foreground">{new Date(rev.createdAt).toLocaleDateString("he-IL")}</span>
                    </div>
                    {rev.changeSummary && <p className="text-xs text-muted-foreground mt-1">{rev.changeSummary}</p>}
                    {rev.changedBy && <p className="text-xs text-muted-foreground">ע"י: {rev.changedBy}</p>}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────
export default function DocumentControl() {
  const [docs, setDocs] = useState<QDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<QDoc | null>(null);
  const [form, setForm] = useState<Partial<QDoc>>({});
  const [saving, setSaving] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<number | null>(null);
  const [newVersionFor, setNewVersionFor] = useState<QDoc | null>(null);
  const [versionForm, setVersionForm] = useState<{ changeSummary: string; author: string }>({ changeSummary: "", author: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await authFetch(`${API}/quality/documents`, { headers: h() });
      const data = await r.json();
      setDocs(Array.isArray(data) ? data.map(mapDoc) : []);
    } catch { setDocs([]); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = docs.filter(d =>
    (filterStatus === "all" || d.status === filterStatus) &&
    (filterType === "all" || d.documentType === filterType) &&
    (!search || d.title.includes(search) || d.documentNumber.includes(search) || d.owner.includes(search) || d.isoStandard.includes(search))
  );

  const stats = {
    total: docs.length,
    draft: docs.filter(d => d.status === "draft").length,
    in_review: docs.filter(d => d.status === "in_review").length,
    approved: docs.filter(d => d.status === "approved").length,
    published: docs.filter(d => d.status === "published").length,
  };

  const openCreate = () => { setEditing(null); setForm({ documentType: "procedure", status: "draft", revisionLabel: "A" }); setShowForm(true); };
  const openEdit = (d: QDoc) => { setEditing(d); setForm({ ...d }); setShowForm(true); };

  const save = async () => {
    setSaving(true);
    try {
      const body = {
        title: form.title, documentType: form.documentType, category: form.category,
        description: form.description, content: form.content, isoStandard: form.isoStandard,
        department: form.department, owner: form.owner, author: form.author,
        revisionLabel: form.revisionLabel, effectiveDate: form.effectiveDate,
        reviewDate: form.reviewDate, expiryDate: form.expiryDate, changeSummary: form.changeSummary,
      };
      if (editing) {
        await authFetch(`${API}/quality/documents/${editing.id}`, { method: "PUT", headers: h(), body: JSON.stringify(body) });
      } else {
        await authFetch(`${API}/quality/documents`, { method: "POST", headers: h(), body: JSON.stringify(body) });
      }
      setShowForm(false);
      load();
    } catch { }
    setSaving(false);
  };

  const saveNewVersion = async () => {
    if (!newVersionFor) return;
    setSaving(true);
    try {
      await authFetch(`${API}/quality/documents/${newVersionFor.id}/new-version`, {
        method: "POST", headers: h(), body: JSON.stringify(versionForm),
      });
      setNewVersionFor(null);
      load();
    } catch { }
    setSaving(false);
  };

  const remove = async (id: number) => {
    if (!confirm("למחוק מסמך זה?")) return;
    await authFetch(`${API}/quality/documents/${id}`, { method: "DELETE", headers: h() });
    setDocs(docs.filter(d => d.id !== id));
  };

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-primary" />בקרת מסמכים
          </h1>
          <p className="text-sm text-muted-foreground mt-1">נהלים | הוראות עבודה | טפסים | מפרטים | תהליכי אישור</p>
        </div>
        <Button onClick={openCreate} className="bg-primary"><Plus className="w-4 h-4 ml-1" />מסמך חדש</Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "סה\"כ", value: stats.total, color: "text-foreground" },
          { label: "טיוטות", value: stats.draft, color: "text-muted-foreground" },
          { label: "בסקירה", value: stats.in_review, color: "text-blue-400" },
          { label: "מאושרים", value: stats.approved, color: "text-green-400" },
          { label: "פורסמו", value: stats.published, color: "text-cyan-400" },
        ].map((s, i) => (
          <Card key={i} className="bg-card/50 border-border/50">
            <CardContent className="p-4 text-center">
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input placeholder="חיפוש מסמך..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9 bg-background/50" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
          <option value="all">כל הסטטוסים</option>
          {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
          <option value="all">כל הסוגים</option>
          {DOC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>

      {/* Table */}
      <Card className="bg-card/50 border-border/50">
        <CardContent className="p-0">
          {loading ? (
            <div className="text-center py-12"><Loader2 className="w-8 h-8 mx-auto animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-lg">אין מסמכים</p>
              <p className="text-sm mt-1">לחץ "מסמך חדש" כדי להתחיל</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border/50">
                  <tr>
                    {["מספר", "כותרת", "סוג", "תקן ISO", "מחלקה", "גרסה", "אישורים", "הפצה", "סטטוס", "פעולות"].map(th => (
                      <th key={th} className="text-right p-3 text-muted-foreground font-medium whitespace-nowrap">{th}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(d => {
                    const s = STATUS_MAP[d.status] || { label: d.status, color: "bg-gray-500/20 text-gray-300", icon: FileText };
                    const approvalPct = d.approvalSteps > 0 ? Math.round((d.approvedSteps / d.approvalSteps) * 100) : null;
                    return (
                      <tr key={d.id} className="border-b border-border/30 hover:bg-card/30 cursor-pointer" onClick={() => setSelectedDocId(d.id)}>
                        <td className="p-3 font-mono text-xs text-muted-foreground">{d.documentNumber}</td>
                        <td className="p-3 font-medium text-foreground max-w-[200px] truncate">{d.title}</td>
                        <td className="p-3 text-xs text-foreground">{DOC_TYPE_HE[d.documentType] || d.documentType}</td>
                        <td className="p-3 font-mono text-xs text-muted-foreground">{d.isoStandard || "—"}</td>
                        <td className="p-3 text-xs text-foreground">{d.department || "—"}</td>
                        <td className="p-3 font-mono text-xs"><span className="text-foreground">v{d.version}</span> <span className="text-muted-foreground">Rev {d.revisionLabel}</span></td>
                        <td className="p-3 text-xs">
                          {approvalPct !== null ? (
                            <span className={approvalPct === 100 ? "text-green-400" : "text-yellow-400"}>{d.approvedSteps}/{d.approvalSteps}</span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="p-3 text-xs">
                          {d.distributionCount > 0 ? (
                            <span className={d.acknowledgedCount === d.distributionCount ? "text-green-400" : "text-foreground"}>{d.acknowledgedCount}/{d.distributionCount}</span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="p-3"><Badge className={`${s.color} text-xs`}>{s.label}</Badge></td>
                        <td className="p-3" onClick={e => e.stopPropagation()}>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm" onClick={() => setSelectedDocId(d.id)} title="פרטים"><Eye className="w-3.5 h-3.5" /></Button>
                            <Button variant="ghost" size="sm" onClick={() => openEdit(d)} title="עריכה"><Edit2 className="w-3.5 h-3.5" /></Button>
                            <Button variant="ghost" size="sm" onClick={() => { setNewVersionFor(d); setVersionForm({ changeSummary: "", author: "" }); }} title="גרסה חדשה"><FilePlus className="w-3.5 h-3.5" /></Button>
                            <Button variant="ghost" size="sm" onClick={() => remove(d.id)} className="text-red-400 hover:text-red-300" title="מחיקה"><Trash2 className="w-3.5 h-3.5" /></Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="px-4 py-2 text-xs text-muted-foreground border-t border-border/30">
            סה"כ: {filtered.length} מסמכים
          </div>
        </CardContent>
      </Card>

      {/* Document Detail Slide-in */}
      {selectedDocId !== null && (
        <DocumentDetail docId={selectedDocId} onClose={() => setSelectedDocId(null)} onRefresh={load} />
      )}

      {/* Create/Edit Form Modal */}
      {showForm && (
        <Modal title={editing ? "עריכת מסמך" : "מסמך חדש"} onClose={() => setShowForm(false)} wide>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="col-span-2"><label className="block text-sm text-muted-foreground mb-1">כותרת *</label>
              <Input value={form.title || ""} onChange={e => setForm({ ...form, title: e.target.value })} className="bg-background/50" /></div>
            <div><label className="block text-sm text-muted-foreground mb-1">סוג מסמך</label>
              <select value={form.documentType || "procedure"} onChange={e => setForm({ ...form, documentType: e.target.value })} className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
                {DOC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select></div>
            <div><label className="block text-sm text-muted-foreground mb-1">קטגוריה</label>
              <Input value={form.category || ""} onChange={e => setForm({ ...form, category: e.target.value })} className="bg-background/50" /></div>
            <div><label className="block text-sm text-muted-foreground mb-1">תקן ISO</label>
              <Input value={form.isoStandard || ""} onChange={e => setForm({ ...form, isoStandard: e.target.value })} placeholder="ISO 9001" className="bg-background/50" /></div>
            <div><label className="block text-sm text-muted-foreground mb-1">גרסת ריוויז'ן</label>
              <Input value={form.revisionLabel || "A"} onChange={e => setForm({ ...form, revisionLabel: e.target.value })} className="bg-background/50" /></div>
            <div><label className="block text-sm text-muted-foreground mb-1">מחלקה</label>
              <Input value={form.department || ""} onChange={e => setForm({ ...form, department: e.target.value })} className="bg-background/50" /></div>
            <div><label className="block text-sm text-muted-foreground mb-1">בעלים</label>
              <Input value={form.owner || ""} onChange={e => setForm({ ...form, owner: e.target.value })} className="bg-background/50" /></div>
            <div><label className="block text-sm text-muted-foreground mb-1">מחבר</label>
              <Input value={form.author || ""} onChange={e => setForm({ ...form, author: e.target.value })} className="bg-background/50" /></div>
            <div><label className="block text-sm text-muted-foreground mb-1">כניסה לתוקף</label>
              <Input type="date" value={form.effectiveDate || ""} onChange={e => setForm({ ...form, effectiveDate: e.target.value })} className="bg-background/50" /></div>
            <div><label className="block text-sm text-muted-foreground mb-1">תאריך סקירה</label>
              <Input type="date" value={form.reviewDate || ""} onChange={e => setForm({ ...form, reviewDate: e.target.value })} className="bg-background/50" /></div>
            <div><label className="block text-sm text-muted-foreground mb-1">תוקף עד</label>
              <Input type="date" value={form.expiryDate || ""} onChange={e => setForm({ ...form, expiryDate: e.target.value })} className="bg-background/50" /></div>
            <div className="col-span-2"><label className="block text-sm text-muted-foreground mb-1">תיאור</label>
              <textarea value={form.description || ""} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground" /></div>
            <div className="col-span-2"><label className="block text-sm text-muted-foreground mb-1">תוכן המסמך</label>
              <textarea value={form.content || ""} onChange={e => setForm({ ...form, content: e.target.value })} rows={6} className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground" /></div>
            {editing && <div className="col-span-2"><label className="block text-sm text-muted-foreground mb-1">סיכום שינויים</label>
              <Input value={form.changeSummary || ""} onChange={e => setForm({ ...form, changeSummary: e.target.value })} className="bg-background/50" /></div>}
          </div>
          <div className="flex gap-3 mt-6">
            <Button onClick={save} disabled={saving} className="bg-primary">
              {saving ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Save className="w-4 h-4 ml-1" />}שמירה
            </Button>
            <Button variant="outline" onClick={() => setShowForm(false)}>ביטול</Button>
          </div>
        </Modal>
      )}

      {/* New Version Modal */}
      {newVersionFor && (
        <Modal title={`גרסה חדשה: ${newVersionFor.title}`} onClose={() => setNewVersionFor(null)}>
          <p className="text-sm text-muted-foreground mb-4">
            גרסה נוכחית: v{newVersionFor.version} Rev {newVersionFor.revisionLabel}. הגרסה הנוכחית תסומן כ"הוחלפה" ותיווצר גרסה חדשה בסטטוס טיוטה.
          </p>
          <div className="space-y-4">
            <div><label className="block text-sm text-muted-foreground mb-1">סיכום שינויים *</label>
              <Input value={versionForm.changeSummary} onChange={e => setVersionForm({ ...versionForm, changeSummary: e.target.value })} className="bg-background/50" /></div>
            <div><label className="block text-sm text-muted-foreground mb-1">מבצע השינוי</label>
              <Input value={versionForm.author} onChange={e => setVersionForm({ ...versionForm, author: e.target.value })} className="bg-background/50" /></div>
          </div>
          <div className="flex gap-3 mt-6">
            <Button onClick={saveNewVersion} disabled={saving} className="bg-primary">
              {saving ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <FilePlus className="w-4 h-4 ml-1" />}צור גרסה חדשה
            </Button>
            <Button variant="outline" onClick={() => setNewVersionFor(null)}>ביטול</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
