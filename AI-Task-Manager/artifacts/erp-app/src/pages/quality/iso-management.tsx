import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Plus, Search, Edit2, Trash2, Eye, X, Save, CheckCircle2, Clock,
  AlertCircle, Award, Target, FileText, Loader2, History, ChevronDown,
  ChevronUp, Star, Calendar, Building2, User, RefreshCw, Shield
} from "lucide-react";
import { authFetch } from "@/lib/utils";

const API = "/api";
const h = () => ({ Authorization: `Bearer ${localStorage.getItem("erp_token") || ""}`, "Content-Type": "application/json" });

// ── Types ──────────────────────────────────────────────
type Cert = {
  id: number; standard: string; scope: string; certificationBody: string;
  certificateNumber: string; status: string; issueDate: string; expiryDate: string;
  lastAuditDate: string; nextAuditDate: string; auditor: string; notes: string;
};

type Policy = {
  id: number; policyNumber: string; title: string; content: string; scope: string;
  version: number; versionLabel: string; status: string; isCurrent: boolean;
  author: string; approvedBy: string; approvedAt: string; effectiveDate: string;
  reviewDate: string; changeSummary: string; tags: string; parentId?: number;
  createdAt: string;
};

type Objective = {
  id: number; objectiveNumber: string; title: string; description: string;
  policyId?: number; policyTitle?: string; targetValue: string; currentValue: string;
  unit: string; dueDate: string; owner: string; department: string;
  priority: string; status: string; progress: number;
};

// ── Helpers ──────────────────────────────────────────────
function mapCert(r: any): Cert {
  return {
    id: r.id, standard: r.standard || "", scope: r.scope || "",
    certificationBody: r.certification_body || "", certificateNumber: r.certificate_number || "",
    status: r.status || "active", issueDate: r.issue_date || "", expiryDate: r.expiry_date || "",
    lastAuditDate: r.last_audit_date || "", nextAuditDate: r.next_audit_date || "",
    auditor: r.auditor || "", notes: r.notes || "",
  };
}

function mapPolicy(r: any): Policy {
  return {
    id: r.id, policyNumber: r.policy_number || "", title: r.title || "",
    content: r.content || "", scope: r.scope || "",
    version: r.version || 1, versionLabel: r.version_label || "1.0",
    status: r.status || "draft", isCurrent: r.is_current || false,
    author: r.author || "", approvedBy: r.approved_by || "", approvedAt: r.approved_at || "",
    effectiveDate: r.effective_date || "", reviewDate: r.review_date || "",
    changeSummary: r.change_summary || "", tags: r.tags || "",
    parentId: r.parent_id, createdAt: r.created_at || "",
  };
}

function mapObjective(r: any): Objective {
  return {
    id: r.id, objectiveNumber: r.objective_number || "", title: r.title || "",
    description: r.description || "", policyId: r.policy_id, policyTitle: r.policy_title || "",
    targetValue: r.target_value || "", currentValue: r.current_value || "", unit: r.unit || "",
    dueDate: r.due_date || "", owner: r.owner || "", department: r.department || "",
    priority: r.priority || "medium", status: r.status || "active",
    progress: r.progress || 0,
  };
}

const CERT_STATUS_MAP: Record<string, string> = {
  active: "bg-green-500/20 text-green-300",
  expired: "bg-red-500/20 text-red-300",
  suspended: "bg-yellow-500/20 text-yellow-300",
  renewal: "bg-purple-500/20 text-purple-300",
  pending: "bg-blue-500/20 text-blue-300",
};
const CERT_STATUS_HE: Record<string, string> = { active: "פעיל", expired: "פג תוקף", suspended: "מושהה", renewal: "בחידוש", pending: "ממתין" };
const POLICY_STATUS_HE: Record<string, string> = { draft: "טיוטה", in_review: "בסקירה", approved: "מאושר", published: "פורסם", archived: "ארכיון" };
const POLICY_STATUS_MAP: Record<string, string> = {
  draft: "bg-muted/50 text-muted-foreground", in_review: "bg-blue-500/20 text-blue-300",
  approved: "bg-green-500/20 text-green-300", published: "bg-cyan-500/20 text-cyan-300",
  archived: "bg-gray-500/20 text-gray-400",
};
const PRIORITY_MAP: Record<string, string> = { low: "נמוך", medium: "בינוני", high: "גבוה", critical: "קריטי" };
const PRIORITY_COLOR: Record<string, string> = {
  low: "bg-gray-500/20 text-gray-300", medium: "bg-blue-500/20 text-blue-300",
  high: "bg-orange-500/20 text-orange-300", critical: "bg-red-500/20 text-red-300",
};

function daysUntil(dateStr: string): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const today = new Date();
  const diff = Math.floor((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  return diff;
}

// ── Modal wrapper ──────────────────────────────────────────────
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center p-6 border-b border-border/50">
          <h2 className="text-xl font-bold text-foreground">{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose}><X className="w-5 h-5" /></Button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

// ── Tab: ISO Certifications ──────────────────────────────────────────────
function CertificationsTab() {
  const [certs, setCerts] = useState<Cert[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Cert | null>(null);
  const [form, setForm] = useState<Partial<Cert>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await authFetch(`${API}/quality/certifications`, { headers: h() });
      const data = await r.json();
      setCerts(Array.isArray(data) ? data.map(mapCert) : []);
    } catch { setCerts([]); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = certs.filter(c =>
    !search || c.standard.includes(search) || c.certificationBody.includes(search) || c.certificateNumber.includes(search)
  );

  const openCreate = () => { setEditing(null); setForm({ status: "active" }); setShowForm(true); };
  const openEdit = (c: Cert) => { setEditing(c); setForm({ ...c }); setShowForm(true); };

  const save = async () => {
    setSaving(true);
    try {
      const body = {
        standard: form.standard, scope: form.scope, certificationBody: form.certificationBody,
        certificateNumber: form.certificateNumber, status: form.status,
        issueDate: form.issueDate, expiryDate: form.expiryDate,
        lastAuditDate: form.lastAuditDate, nextAuditDate: form.nextAuditDate,
        auditor: form.auditor, notes: form.notes,
      };
      if (editing) {
        await authFetch(`${API}/quality/certifications/${editing.id}`, { method: "PUT", headers: h(), body: JSON.stringify(body) });
      } else {
        await authFetch(`${API}/quality/certifications`, { method: "POST", headers: h(), body: JSON.stringify(body) });
      }
      setShowForm(false);
      load();
    } catch { }
    setSaving(false);
  };

  const remove = async (id: number) => {
    if (!confirm("למחוק?")) return;
    await authFetch(`${API}/quality/certifications/${id}`, { method: "DELETE", headers: h() });
    setCerts(certs.filter(c => c.id !== id));
  };

  const stats = {
    active: certs.filter(c => c.status === "active").length,
    expiring: certs.filter(c => { const d = daysUntil(c.expiryDate); return d !== null && d <= 90 && d > 0; }).length,
    expired: certs.filter(c => c.status === "expired" || (daysUntil(c.expiryDate) ?? 1) <= 0).length,
    renewal: certs.filter(c => c.status === "renewal").length,
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "תקני ISO פעילים", value: stats.active, color: "text-green-400", icon: CheckCircle2 },
          { label: "פגים בקרוב (90 יום)", value: stats.expiring, color: "text-yellow-400", icon: AlertCircle },
          { label: "פגי תוקף", value: stats.expired, color: "text-red-400", icon: Clock },
          { label: "בחידוש", value: stats.renewal, color: "text-purple-400", icon: RefreshCw },
        ].map((s, i) => (
          <Card key={i} className="bg-card/50 border-border/50">
            <CardContent className="p-4 flex items-center gap-3">
              <s.icon className={`w-8 h-8 ${s.color} opacity-80`} />
              <div>
                <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input placeholder="חיפוש תקן..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9 bg-background/50" />
        </div>
        <Button size="sm" onClick={openCreate} className="bg-primary"><Plus className="w-4 h-4 ml-1" />הוסף תעודה</Button>
      </div>

      <Card className="bg-card/50 border-border/50">
        <CardContent className="p-0">
          {loading ? (
            <div className="text-center py-12"><Loader2 className="w-8 h-8 mx-auto animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Award className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>אין תעודות ISO</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border/50">
                  <tr>
                    {["תקן", "גוף הסמכה", "מספר תעודה", "סטטוס", "תוקף", "ביקורת הבאה", "מבקר", "פעולות"].map(h => (
                      <th key={h} className="text-right p-3 text-muted-foreground font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(c => {
                    const days = daysUntil(c.expiryDate);
                    const isExpiringSoon = days !== null && days <= 90 && days > 0;
                    return (
                      <tr key={c.id} className="border-b border-border/30 hover:bg-card/30">
                        <td className="p-3 font-mono font-bold text-foreground">{c.standard}</td>
                        <td className="p-3 text-foreground">{c.certificationBody}</td>
                        <td className="p-3 font-mono text-xs text-muted-foreground">{c.certificateNumber}</td>
                        <td className="p-3"><Badge className={CERT_STATUS_MAP[c.status] || "bg-gray-500/20 text-gray-300"}>{CERT_STATUS_HE[c.status] || c.status}</Badge></td>
                        <td className="p-3">
                          <span className={isExpiringSoon ? "text-yellow-400 font-medium" : "text-foreground"}>{c.expiryDate || "—"}</span>
                          {isExpiringSoon && <span className="text-xs text-yellow-400 mr-1">({days} ימים)</span>}
                        </td>
                        <td className="p-3 text-foreground">{c.nextAuditDate || "—"}</td>
                        <td className="p-3 text-foreground">{c.auditor || "—"}</td>
                        <td className="p-3">
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm" onClick={() => openEdit(c)}><Edit2 className="w-3.5 h-3.5" /></Button>
                            <Button variant="ghost" size="sm" onClick={() => remove(c.id)} className="text-red-400 hover:text-red-300"><Trash2 className="w-3.5 h-3.5" /></Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {showForm && (
        <Modal title={editing ? "עריכת תעודת ISO" : "תעודת ISO חדשה"} onClose={() => setShowForm(false)}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className="block text-sm text-muted-foreground mb-1">תקן *</label>
              <Input value={form.standard || ""} onChange={e => setForm({ ...form, standard: e.target.value })} placeholder="ISO 9001:2015" className="bg-background/50" /></div>
            <div><label className="block text-sm text-muted-foreground mb-1">סטטוס</label>
              <select value={form.status || "active"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
                {Object.entries(CERT_STATUS_HE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></div>
            <div className="col-span-2"><label className="block text-sm text-muted-foreground mb-1">היקף</label>
              <textarea value={form.scope || ""} onChange={e => setForm({ ...form, scope: e.target.value })} rows={2} className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground" /></div>
            <div><label className="block text-sm text-muted-foreground mb-1">גוף הסמכה</label>
              <Input value={form.certificationBody || ""} onChange={e => setForm({ ...form, certificationBody: e.target.value })} className="bg-background/50" /></div>
            <div><label className="block text-sm text-muted-foreground mb-1">מספר תעודה</label>
              <Input value={form.certificateNumber || ""} onChange={e => setForm({ ...form, certificateNumber: e.target.value })} className="bg-background/50" /></div>
            <div><label className="block text-sm text-muted-foreground mb-1">תאריך הנפקה</label>
              <Input type="date" value={form.issueDate || ""} onChange={e => setForm({ ...form, issueDate: e.target.value })} className="bg-background/50" /></div>
            <div><label className="block text-sm text-muted-foreground mb-1">תוקף עד</label>
              <Input type="date" value={form.expiryDate || ""} onChange={e => setForm({ ...form, expiryDate: e.target.value })} className="bg-background/50" /></div>
            <div><label className="block text-sm text-muted-foreground mb-1">ביקורת אחרונה</label>
              <Input type="date" value={form.lastAuditDate || ""} onChange={e => setForm({ ...form, lastAuditDate: e.target.value })} className="bg-background/50" /></div>
            <div><label className="block text-sm text-muted-foreground mb-1">ביקורת הבאה</label>
              <Input type="date" value={form.nextAuditDate || ""} onChange={e => setForm({ ...form, nextAuditDate: e.target.value })} className="bg-background/50" /></div>
            <div><label className="block text-sm text-muted-foreground mb-1">מבקר</label>
              <Input value={form.auditor || ""} onChange={e => setForm({ ...form, auditor: e.target.value })} className="bg-background/50" /></div>
            <div className="col-span-2"><label className="block text-sm text-muted-foreground mb-1">הערות</label>
              <textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground" /></div>
          </div>
          <div className="flex gap-3 mt-6">
            <Button onClick={save} disabled={saving} className="bg-primary">
              {saving ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Save className="w-4 h-4 ml-1" />}שמירה
            </Button>
            <Button variant="outline" onClick={() => setShowForm(false)}>ביטול</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Tab: Quality Policies ──────────────────────────────────────────────
function PoliciesTab() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Policy | null>(null);
  const [form, setForm] = useState<Partial<Policy & { isCurrent: boolean }>>({});
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [history, setHistory] = useState<Policy[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showVersionForm, setShowVersionForm] = useState<Policy | null>(null);
  const [versionForm, setVersionForm] = useState<Partial<Policy>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await authFetch(`${API}/quality/policies`, { headers: h() });
      const data = await r.json();
      setPolicies(Array.isArray(data) ? data.map(mapPolicy) : []);
    } catch { setPolicies([]); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadHistory = async (id: number) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    setLoadingHistory(true);
    try {
      const r = await authFetch(`${API}/quality/policies/${id}/history`, { headers: h() });
      const data = await r.json();
      setHistory(Array.isArray(data) ? data.map(mapPolicy) : []);
    } catch { setHistory([]); }
    setLoadingHistory(false);
  };

  const filtered = policies.filter(p =>
    !search || p.title.includes(search) || p.policyNumber.includes(search) || p.author.includes(search)
  );

  const openCreate = () => { setEditing(null); setForm({ status: "draft", isCurrent: false }); setShowForm(true); };
  const openEdit = (p: Policy) => { setEditing(p); setForm({ ...p }); setShowForm(true); };

  const save = async () => {
    setSaving(true);
    try {
      const body = { ...form };
      if (editing) {
        await authFetch(`${API}/quality/policies/${editing.id}`, { method: "PUT", headers: h(), body: JSON.stringify(body) });
      } else {
        await authFetch(`${API}/quality/policies`, { method: "POST", headers: h(), body: JSON.stringify(body) });
      }
      setShowForm(false);
      load();
    } catch { }
    setSaving(false);
  };

  const newVersion = async () => {
    if (!showVersionForm) return;
    setSaving(true);
    try {
      await authFetch(`${API}/quality/policies/${showVersionForm.id}/new-version`, {
        method: "POST", headers: h(), body: JSON.stringify(versionForm),
      });
      setShowVersionForm(null);
      load();
    } catch { }
    setSaving(false);
  };

  const remove = async (id: number) => {
    if (!confirm("למחוק?")) return;
    await authFetch(`${API}/quality/policies/${id}`, { method: "DELETE", headers: h() });
    setPolicies(policies.filter(p => p.id !== id));
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input placeholder="חיפוש מדיניות..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9 bg-background/50" />
        </div>
        <Button size="sm" onClick={openCreate} className="bg-primary"><Plus className="w-4 h-4 ml-1" />מדיניות חדשה</Button>
      </div>

      {loading ? (
        <div className="text-center py-12"><Loader2 className="w-8 h-8 mx-auto animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>אין מדיניות איכות</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(p => (
            <Card key={p.id} className="bg-card/50 border-border/50">
              <CardContent className="p-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs text-muted-foreground">{p.policyNumber}</span>
                      <Badge className={POLICY_STATUS_MAP[p.status] || "bg-gray-500/20 text-gray-400"}>{POLICY_STATUS_HE[p.status] || p.status}</Badge>
                      {p.isCurrent && <Badge className="bg-yellow-500/20 text-yellow-300 flex items-center gap-1"><Star className="w-3 h-3" />נוכחי</Badge>}
                      <Badge variant="outline" className="text-xs">v{p.versionLabel || p.version}</Badge>
                    </div>
                    <h3 className="text-foreground font-semibold mt-1">{p.title}</h3>
                    {p.scope && <p className="text-xs text-muted-foreground mt-1">{p.scope}</p>}
                    <div className="flex gap-4 mt-2 flex-wrap text-xs text-muted-foreground">
                      {p.author && <span className="flex items-center gap-1"><User className="w-3 h-3" />{p.author}</span>}
                      {p.effectiveDate && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />כניסה לתוקף: {p.effectiveDate}</span>}
                      {p.reviewDate && <span className="flex items-center gap-1"><RefreshCw className="w-3 h-3" />סקירה: {p.reviewDate}</span>}
                    </div>
                  </div>
                  <div className="flex gap-1 mr-2">
                    <Button variant="ghost" size="sm" onClick={() => loadHistory(p.id)} title="היסטוריית גרסאות">
                      <History className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => { setShowVersionForm(p); setVersionForm({ title: p.title, content: p.content, scope: p.scope }); }} title="גרסה חדשה">
                      <Plus className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(p)}><Edit2 className="w-3.5 h-3.5" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => remove(p.id)} className="text-red-400 hover:text-red-300"><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </div>

                {expanded === p.id && (
                  <div className="mt-4 border-t border-border/50 pt-4">
                    {loadingHistory ? (
                      <div className="text-center py-4"><Loader2 className="w-5 h-5 mx-auto animate-spin text-muted-foreground" /></div>
                    ) : (
                      <div>
                        <h4 className="text-sm font-medium text-muted-foreground mb-2">היסטוריית גרסאות</h4>
                        <div className="space-y-2">
                          {history.map(h => (
                            <div key={h.id} className={`p-3 rounded-lg border ${h.id === p.id ? "border-primary/50 bg-primary/5" : "border-border/30 bg-muted/10"}`}>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-xs">v{h.versionLabel}</Badge>
                                  <Badge className={POLICY_STATUS_MAP[h.status] || "bg-gray-500/20 text-gray-400 text-xs"}>{POLICY_STATUS_HE[h.status] || h.status}</Badge>
                                  {h.isCurrent && <Badge className="bg-yellow-500/20 text-yellow-300 text-xs">נוכחי</Badge>}
                                </div>
                                <span className="text-xs text-muted-foreground">{new Date(h.createdAt).toLocaleDateString("he-IL")}</span>
                              </div>
                              {h.changeSummary && <p className="text-xs text-muted-foreground mt-1">{h.changeSummary}</p>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showForm && (
        <Modal title={editing ? "עריכת מדיניות" : "מדיניות חדשה"} onClose={() => setShowForm(false)}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="col-span-2"><label className="block text-sm text-muted-foreground mb-1">כותרת *</label>
              <Input value={form.title || ""} onChange={e => setForm({ ...form, title: e.target.value })} className="bg-background/50" /></div>
            <div><label className="block text-sm text-muted-foreground mb-1">סטטוס</label>
              <select value={form.status || "draft"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
                {Object.entries(POLICY_STATUS_HE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></div>
            <div><label className="block text-sm text-muted-foreground mb-1">גרסה</label>
              <Input value={form.versionLabel || "1.0"} onChange={e => setForm({ ...form, versionLabel: e.target.value })} className="bg-background/50" /></div>
            <div className="col-span-2"><label className="block text-sm text-muted-foreground mb-1">היקף</label>
              <textarea value={form.scope || ""} onChange={e => setForm({ ...form, scope: e.target.value })} rows={2} className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground" /></div>
            <div className="col-span-2"><label className="block text-sm text-muted-foreground mb-1">תוכן המדיניות</label>
              <textarea value={form.content || ""} onChange={e => setForm({ ...form, content: e.target.value })} rows={5} className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground" /></div>
            <div><label className="block text-sm text-muted-foreground mb-1">מחבר</label>
              <Input value={form.author || ""} onChange={e => setForm({ ...form, author: e.target.value })} className="bg-background/50" /></div>
            <div><label className="block text-sm text-muted-foreground mb-1">מאושר ע"י</label>
              <Input value={form.approvedBy || ""} onChange={e => setForm({ ...form, approvedBy: e.target.value })} className="bg-background/50" /></div>
            <div><label className="block text-sm text-muted-foreground mb-1">תאריך כניסה לתוקף</label>
              <Input type="date" value={form.effectiveDate || ""} onChange={e => setForm({ ...form, effectiveDate: e.target.value })} className="bg-background/50" /></div>
            <div><label className="block text-sm text-muted-foreground mb-1">תאריך סקירה</label>
              <Input type="date" value={form.reviewDate || ""} onChange={e => setForm({ ...form, reviewDate: e.target.value })} className="bg-background/50" /></div>
            <div className="col-span-2"><label className="block text-sm text-muted-foreground mb-1">סיכום שינויים</label>
              <Input value={form.changeSummary || ""} onChange={e => setForm({ ...form, changeSummary: e.target.value })} className="bg-background/50" /></div>
            <div className="col-span-2 flex items-center gap-2">
              <input type="checkbox" id="isCurrent" checked={form.isCurrent || false} onChange={e => setForm({ ...form, isCurrent: e.target.checked })} className="w-4 h-4" />
              <label htmlFor="isCurrent" className="text-sm text-foreground">סמן כמדיניות נוכחית</label>
            </div>
          </div>
          <div className="flex gap-3 mt-6">
            <Button onClick={save} disabled={saving} className="bg-primary">
              {saving ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Save className="w-4 h-4 ml-1" />}שמירה
            </Button>
            <Button variant="outline" onClick={() => setShowForm(false)}>ביטול</Button>
          </div>
        </Modal>
      )}

      {showVersionForm && (
        <Modal title={`גרסה חדשה: ${showVersionForm.title}`} onClose={() => setShowVersionForm(null)}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="col-span-2"><label className="block text-sm text-muted-foreground mb-1">כותרת</label>
              <Input value={versionForm.title || ""} onChange={e => setVersionForm({ ...versionForm, title: e.target.value })} className="bg-background/50" /></div>
            <div><label className="block text-sm text-muted-foreground mb-1">תווית גרסה</label>
              <Input value={versionForm.versionLabel || ""} placeholder={`${(showVersionForm.version || 1) + 1}.0`} onChange={e => setVersionForm({ ...versionForm, versionLabel: e.target.value })} className="bg-background/50" /></div>
            <div><label className="block text-sm text-muted-foreground mb-1">מחבר</label>
              <Input value={versionForm.author || ""} onChange={e => setVersionForm({ ...versionForm, author: e.target.value })} className="bg-background/50" /></div>
            <div className="col-span-2"><label className="block text-sm text-muted-foreground mb-1">סיכום שינויים *</label>
              <Input value={versionForm.changeSummary || ""} onChange={e => setVersionForm({ ...versionForm, changeSummary: e.target.value })} className="bg-background/50" /></div>
            <div className="col-span-2"><label className="block text-sm text-muted-foreground mb-1">תוכן מעודכן</label>
              <textarea value={versionForm.content || showVersionForm.content || ""} onChange={e => setVersionForm({ ...versionForm, content: e.target.value })} rows={5} className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground" /></div>
          </div>
          <div className="flex gap-3 mt-6">
            <Button onClick={newVersion} disabled={saving} className="bg-primary">
              {saving ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Plus className="w-4 h-4 ml-1" />}צור גרסה חדשה
            </Button>
            <Button variant="outline" onClick={() => setShowVersionForm(null)}>ביטול</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Tab: Quality Objectives ──────────────────────────────────────────────
function ObjectivesTab() {
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Objective | null>(null);
  const [form, setForm] = useState<Partial<Objective>>({});
  const [saving, setSaving] = useState(false);
  const [policies, setPolicies] = useState<Policy[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [objs, pols] = await Promise.all([
        authFetch(`${API}/quality/objectives`, { headers: h() }).then(r => r.json()),
        authFetch(`${API}/quality/policies`, { headers: h() }).then(r => r.json()),
      ]);
      setObjectives(Array.isArray(objs) ? objs.map(mapObjective) : []);
      setPolicies(Array.isArray(pols) ? pols.map(mapPolicy) : []);
    } catch { setObjectives([]); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = objectives.filter(o =>
    !search || o.title.includes(search) || o.owner.includes(search) || o.department.includes(search)
  );

  const openCreate = () => { setEditing(null); setForm({ priority: "medium", status: "active", progress: 0 }); setShowForm(true); };
  const openEdit = (o: Objective) => { setEditing(o); setForm({ ...o }); setShowForm(true); };

  const save = async () => {
    setSaving(true);
    try {
      const body = { ...form };
      if (editing) {
        await authFetch(`${API}/quality/objectives/${editing.id}`, { method: "PUT", headers: h(), body: JSON.stringify(body) });
      } else {
        await authFetch(`${API}/quality/objectives`, { method: "POST", headers: h(), body: JSON.stringify(body) });
      }
      setShowForm(false);
      load();
    } catch { }
    setSaving(false);
  };

  const remove = async (id: number) => {
    if (!confirm("למחוק?")) return;
    await authFetch(`${API}/quality/objectives/${id}`, { method: "DELETE", headers: h() });
    setObjectives(objectives.filter(o => o.id !== id));
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input placeholder="חיפוש יעד..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9 bg-background/50" />
        </div>
        <Button size="sm" onClick={openCreate} className="bg-primary"><Plus className="w-4 h-4 ml-1" />יעד חדש</Button>
      </div>

      {loading ? (
        <div className="text-center py-12"><Loader2 className="w-8 h-8 mx-auto animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Target className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>אין יעדי איכות</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map(o => (
            <Card key={o.id} className="bg-card/50 border-border/50">
              <CardContent className="p-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-mono text-xs text-muted-foreground">{o.objectiveNumber}</span>
                      <Badge className={PRIORITY_COLOR[o.priority] || "bg-gray-500/20 text-gray-300"}>{PRIORITY_MAP[o.priority] || o.priority}</Badge>
                    </div>
                    <h3 className="text-foreground font-medium text-sm">{o.title}</h3>
                    {o.policyTitle && <p className="text-xs text-muted-foreground mt-0.5">מדיניות: {o.policyTitle}</p>}
                    {o.description && <p className="text-xs text-muted-foreground mt-1">{o.description}</p>}
                    <div className="mt-3">
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>התקדמות</span>
                        <span>{o.progress}%</span>
                      </div>
                      <div className="w-full bg-muted/30 rounded-full h-2">
                        <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${o.progress}%` }} />
                      </div>
                    </div>
                    <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
                      {o.targetValue && <span>יעד: <span className="text-foreground">{o.targetValue} {o.unit}</span></span>}
                      {o.currentValue && <span>נוכחי: <span className="text-green-400">{o.currentValue} {o.unit}</span></span>}
                      {o.dueDate && <span>עד: {o.dueDate}</span>}
                    </div>
                    {(o.owner || o.department) && (
                      <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                        {o.owner && <span className="flex items-center gap-1"><User className="w-3 h-3" />{o.owner}</span>}
                        {o.department && <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{o.department}</span>}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1 mr-2">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(o)}><Edit2 className="w-3.5 h-3.5" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => remove(o.id)} className="text-red-400 hover:text-red-300"><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showForm && (
        <Modal title={editing ? "עריכת יעד" : "יעד איכות חדש"} onClose={() => setShowForm(false)}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="col-span-2"><label className="block text-sm text-muted-foreground mb-1">כותרת *</label>
              <Input value={form.title || ""} onChange={e => setForm({ ...form, title: e.target.value })} className="bg-background/50" /></div>
            <div><label className="block text-sm text-muted-foreground mb-1">עדיפות</label>
              <select value={form.priority || "medium"} onChange={e => setForm({ ...form, priority: e.target.value })} className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
                {Object.entries(PRIORITY_MAP).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></div>
            <div><label className="block text-sm text-muted-foreground mb-1">סטטוס</label>
              <select value={form.status || "active"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
                <option value="active">פעיל</option><option value="completed">הושלם</option><option value="cancelled">בוטל</option><option value="on_hold">בהמתנה</option>
              </select></div>
            <div><label className="block text-sm text-muted-foreground mb-1">מדיניות קשורה</label>
              <select value={form.policyId || ""} onChange={e => setForm({ ...form, policyId: e.target.value ? parseInt(e.target.value) : undefined })} className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
                <option value="">— ללא —</option>
                {policies.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select></div>
            <div><label className="block text-sm text-muted-foreground mb-1">מחלקה</label>
              <Input value={form.department || ""} onChange={e => setForm({ ...form, department: e.target.value })} className="bg-background/50" /></div>
            <div><label className="block text-sm text-muted-foreground mb-1">בעל תפקיד</label>
              <Input value={form.owner || ""} onChange={e => setForm({ ...form, owner: e.target.value })} className="bg-background/50" /></div>
            <div><label className="block text-sm text-muted-foreground mb-1">ערך יעד</label>
              <Input value={form.targetValue || ""} onChange={e => setForm({ ...form, targetValue: e.target.value })} className="bg-background/50" /></div>
            <div><label className="block text-sm text-muted-foreground mb-1">ערך נוכחי</label>
              <Input value={form.currentValue || ""} onChange={e => setForm({ ...form, currentValue: e.target.value })} className="bg-background/50" /></div>
            <div><label className="block text-sm text-muted-foreground mb-1">יחידת מידה</label>
              <Input value={form.unit || ""} onChange={e => setForm({ ...form, unit: e.target.value })} placeholder="%, ₪, יחידות..." className="bg-background/50" /></div>
            <div><label className="block text-sm text-muted-foreground mb-1">תאריך יעד</label>
              <Input type="date" value={form.dueDate || ""} onChange={e => setForm({ ...form, dueDate: e.target.value })} className="bg-background/50" /></div>
            <div><label className="block text-sm text-muted-foreground mb-1">התקדמות ({form.progress || 0}%)</label>
              <input type="range" min="0" max="100" value={form.progress || 0} onChange={e => setForm({ ...form, progress: parseInt(e.target.value) })} className="w-full" /></div>
            <div className="col-span-2"><label className="block text-sm text-muted-foreground mb-1">תיאור</label>
              <textarea value={form.description || ""} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground" /></div>
          </div>
          <div className="flex gap-3 mt-6">
            <Button onClick={save} disabled={saving} className="bg-primary">
              {saving ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Save className="w-4 h-4 ml-1" />}שמירה
            </Button>
            <Button variant="outline" onClick={() => setShowForm(false)}>ביטול</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────
export default function IsoManagement() {
  const [tab, setTab] = useState<"certs" | "policies" | "objectives">("certs");

  const tabs = [
    { key: "certs", label: "תעודות ISO", icon: Award },
    { key: "policies", label: "מדיניות איכות", icon: FileText },
    { key: "objectives", label: "יעדי איכות", icon: Target },
  ] as const;

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Shield className="w-6 h-6 text-primary" />ניהול ISO ומדיניות איכות
          </h1>
          <p className="text-sm text-muted-foreground mt-1">ISO 9001 | מדיניות | יעדים | תעודות</p>
        </div>
      </div>

      <div className="flex gap-1 border-b border-border/50 pb-0">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${tab === t.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            <t.icon className="w-4 h-4" />{t.label}
          </button>
        ))}
      </div>

      <div>
        {tab === "certs" && <CertificationsTab />}
        {tab === "policies" && <PoliciesTab />}
        {tab === "objectives" && <ObjectivesTab />}
      </div>
    </div>
  );
}
