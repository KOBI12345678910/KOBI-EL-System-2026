import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Plus, Search, Eye, Edit2, Trash2, ChevronRight, ChevronLeft,
  AlertCircle, CheckCircle2, Clock, X, Save, ClipboardList,
  ChevronDown, ChevronUp, AlertTriangle
} from "lucide-react";

const BASE = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

const AUDIT_STATUS_COLORS: Record<string, string> = {
  planned: "bg-blue-500/20 text-blue-300",
  in_progress: "bg-yellow-500/20 text-yellow-300",
  completed: "bg-green-500/20 text-green-300",
  open_findings: "bg-red-500/20 text-red-300",
};
const AUDIT_STATUS_LABELS: Record<string, string> = {
  planned: "מתוכנן",
  in_progress: "בביצוע",
  completed: "הושלם",
  open_findings: "ממצאים פתוחים",
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-500/20 text-red-300",
  major: "bg-orange-500/20 text-orange-300",
  minor: "bg-yellow-500/20 text-yellow-300",
  observation: "bg-blue-500/20 text-blue-300",
};
const SEVERITY_LABELS: Record<string, string> = {
  critical: "קריטי",
  major: "משמעותי",
  minor: "מינורי",
  observation: "תצפית",
};

const FINDING_STATUS_COLORS: Record<string, string> = {
  open: "bg-red-500/20 text-red-300",
  in_progress: "bg-yellow-500/20 text-yellow-300",
  closed: "bg-green-500/20 text-green-300",
};

interface Audit {
  id: number;
  audit_number: string;
  scope: string;
  auditor: string;
  auditee: string;
  scheduled_date: string;
  execution_date: string;
  status: string;
  audit_type: string;
  notes: string;
}

interface Finding {
  id: number;
  audit_id: number;
  finding_number: string;
  description: string;
  severity: string;
  clause: string;
  evidence: string;
  status: string;
  responsible_person: string;
  due_date: string;
  closed_date: string;
  corrective_actions?: CorrectiveAction[];
}

interface CorrectiveAction {
  id: number;
  finding_id: number;
  description: string;
  assigned_to: string;
  due_date: string;
  status: string;
  completed_date: string;
}

const emptyAudit = {
  scope: "", auditor: "", auditee: "", scheduledDate: "",
  executionDate: "", status: "planned", auditType: "internal", notes: ""
};
const emptyFinding = {
  description: "", severity: "minor", clause: "", evidence: "",
  status: "open", responsiblePerson: "", dueDate: ""
};
const emptyCA = { description: "", assignedTo: "", dueDate: "", status: "open" };

export default function InternalAudit() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const perPage = 15;

  const [showAuditForm, setShowAuditForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyAudit });
  const [saving, setSaving] = useState(false);

  const [selectedAudit, setSelectedAudit] = useState<Audit | null>(null);
  const [showFindingForm, setShowFindingForm] = useState(false);
  const [findingForm, setFindingForm] = useState({ ...emptyFinding });
  const [expandedFindings, setExpandedFindings] = useState<Set<number>>(new Set());
  const [showCAForm, setShowCAForm] = useState<number | null>(null);
  const [caForm, setCaForm] = useState({ ...emptyCA });

  const { data: audits = [], isLoading: loading } = useQuery<Audit[]>({
    queryKey: ["internal-audits"],
    queryFn: async () => {
      const res = await authFetch(`${BASE}/internal-audits`);
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 60_000,
  });

  const { data: findings = [], isLoading: findingsLoading } = useQuery<Finding[]>({
    queryKey: ["audit-findings", selectedAudit?.id],
    queryFn: async () => {
      if (!selectedAudit) return [];
      const res = await authFetch(`${BASE}/audit-findings?auditId=${selectedAudit.id}`);
      const data = await res.json();
      const enriched = await Promise.all(data.map(async (f: Finding) => {
        const caRes = await authFetch(`${BASE}/audit-corrective-actions?findingId=${f.id}`);
        const cas = await caRes.json();
        return { ...f, corrective_actions: cas };
      }));
      return enriched;
    },
    enabled: !!selectedAudit,
    staleTime: 30_000,
  });

  const filtered = useMemo(() => {
    return audits.filter(a => {
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return a.scope?.toLowerCase().includes(q) || a.auditor?.toLowerCase().includes(q) ||
          a.audit_number?.toLowerCase().includes(q);
      }
      return true;
    });
  }, [audits, search, statusFilter]);

  const pageData = filtered.slice((page - 1) * perPage, page * perPage);
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));

  const statCounts = {
    planned: audits.filter(a => a.status === "planned").length,
    in_progress: audits.filter(a => a.status === "in_progress").length,
    completed: audits.filter(a => a.status === "completed").length,
    open_findings: audits.filter(a => a.status === "open_findings").length,
  };

  async function handleSaveAudit() {
    setSaving(true);
    try {
      const url = editId ? `${BASE}/internal-audits/${editId}` : `${BASE}/internal-audits`;
      const method = editId ? "PUT" : "POST";
      const auditNumber = `AUD-${new Date().getFullYear()}-${String(audits.length + 1).padStart(3, "0")}`;
      await authFetch(url, {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, auditNumber: editId ? undefined : auditNumber })
      });
      setShowAuditForm(false);
      setEditId(null);
      setForm({ ...emptyAudit });
      queryClient.invalidateQueries({ queryKey: ["internal-audits"] });
    } catch { } finally { setSaving(false); }
  }

  async function handleSaveFinding() {
    if (!selectedAudit) return;
    setSaving(true);
    try {
      const findingNumber = `F-${selectedAudit.id}-${findings.length + 1}`;
      await authFetch(`${BASE}/audit-findings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auditId: selectedAudit.id, findingNumber, ...findingForm })
      });
      setShowFindingForm(false);
      setFindingForm({ ...emptyFinding });
      queryClient.invalidateQueries({ queryKey: ["audit-findings", selectedAudit.id] });
      queryClient.invalidateQueries({ queryKey: ["internal-audits"] });
    } catch { } finally { setSaving(false); }
  }

  async function handleSaveCA(findingId: number) {
    setSaving(true);
    try {
      await authFetch(`${BASE}/audit-corrective-actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ findingId, ...caForm })
      });
      setShowCAForm(null);
      setCaForm({ ...emptyCA });
      if (selectedAudit) queryClient.invalidateQueries({ queryKey: ["audit-findings", selectedAudit.id] });
    } catch { } finally { setSaving(false); }
  }

  async function updateFindingStatus(id: number, status: string) {
    await authFetch(`${BASE}/audit-findings/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, closedDate: status === "closed" ? new Date().toISOString().split("T")[0] : null })
    });
    if (selectedAudit) queryClient.invalidateQueries({ queryKey: ["audit-findings", selectedAudit.id] });
  }

  function openEdit(a: Audit) {
    setEditId(a.id);
    setForm({
      scope: a.scope || "", auditor: a.auditor || "", auditee: a.auditee || "",
      scheduledDate: a.scheduled_date?.split("T")[0] || "",
      executionDate: a.execution_date?.split("T")[0] || "",
      status: a.status || "planned", auditType: a.audit_type || "internal", notes: a.notes || ""
    });
    setShowAuditForm(true);
  }

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">ביקורת פנימית</h1>
          <p className="text-sm text-muted-foreground mt-1">תכנון, ביצוע וממצאי ביקורות פנימיות</p>
        </div>
        <Button size="sm" className="bg-primary" onClick={() => { setShowAuditForm(true); setEditId(null); setForm({ ...emptyAudit }); }}>
          <Plus className="w-4 h-4 ml-1" />ביקורת חדשה
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { key: "planned", icon: Clock, color: "text-blue-400", label: "מתוכנן" },
          { key: "in_progress", icon: ClipboardList, color: "text-yellow-400", label: "בביצוע" },
          { key: "completed", icon: CheckCircle2, color: "text-green-400", label: "הושלם" },
          { key: "open_findings", icon: AlertTriangle, color: "text-red-400", label: "ממצאים פתוחים" },
        ].map(({ key, icon: Icon, color, label }) => (
          <Card key={key} className="bg-card/50 border-border/50 cursor-pointer hover:bg-card/70"
            onClick={() => setStatusFilter(statusFilter === key ? "all" : key)}>
            <CardContent className="p-4 flex items-center gap-3">
              <Icon className={`w-8 h-8 ${color}`} />
              <div>
                <div className="text-2xl font-bold text-foreground">{statCounts[key as keyof typeof statCounts]}</div>
                <div className="text-xs text-muted-foreground">{label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Audit List */}
      <Card className="bg-card/50 border-border/50">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input placeholder="חיפוש..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pr-9 bg-background/50" />
            </div>
            <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
              className="bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
              <option value="all">כל הסטטוסים</option>
              {Object.entries(AUDIT_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>

          {loading ? (
            <div className="text-center py-16 text-muted-foreground">טוען...</div>
          ) : pageData.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-lg font-medium">אין ביקורות להצגה</p>
              <p className="text-sm mt-1">לחץ על "ביקורת חדשה" כדי להתחיל</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50">
                    {["מספר ביקורת", "תחום", "מבקר", "נבדק", "תאריך מתוכנן", "תאריך ביצוע", "סטטוס", "פעולות"].map(h => (
                      <th key={h} className="text-right p-3 text-muted-foreground font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageData.map(a => (
                    <tr key={a.id} className="border-b border-border/30 hover:bg-card/30 transition-colors">
                      <td className="p-3 font-medium text-foreground">{a.audit_number}</td>
                      <td className="p-3 text-foreground">{a.scope}</td>
                      <td className="p-3 text-muted-foreground">{a.auditor || "—"}</td>
                      <td className="p-3 text-muted-foreground">{a.auditee || "—"}</td>
                      <td className="p-3 text-muted-foreground">{a.scheduled_date ? new Date(a.scheduled_date).toLocaleDateString("he-IL") : "—"}</td>
                      <td className="p-3 text-muted-foreground">{a.execution_date ? new Date(a.execution_date).toLocaleDateString("he-IL") : "—"}</td>
                      <td className="p-3"><Badge className={AUDIT_STATUS_COLORS[a.status] || "bg-gray-500/20 text-gray-300"}>{AUDIT_STATUS_LABELS[a.status] || a.status}</Badge></td>
                      <td className="p-3">
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" onClick={() => { setSelectedAudit(a); }}>
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => openEdit(a)}><Edit2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
            <span>{filtered.length} ביקורות</span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronRight className="w-4 h-4" /></Button>
              <span className="px-3 py-1">{page}/{totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}><ChevronLeft className="w-4 h-4" /></Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Audit Detail Modal */}
      {selectedAudit && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-3xl bg-card border-border max-h-[90vh] flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between pb-3 shrink-0">
              <div>
                <CardTitle className="text-foreground">{selectedAudit.audit_number} — {selectedAudit.scope}</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">מבקר: {selectedAudit.auditor || "—"} | נבדק: {selectedAudit.auditee || "—"}</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => setShowFindingForm(true)}><Plus className="w-4 h-4 ml-1" />ממצא חדש</Button>
                <Button variant="ghost" size="sm" onClick={() => { setSelectedAudit(null); setShowFindingForm(false); }}><X className="w-4 h-4" /></Button>
              </div>
            </CardHeader>
            <CardContent className="overflow-y-auto">
              {showFindingForm && (
                <div className="mb-4 p-4 bg-background/50 rounded-lg space-y-3">
                  <h3 className="font-medium text-foreground">הוספת ממצא</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <Label>תיאור הממצא *</Label>
                      <textarea value={findingForm.description} onChange={e => setFindingForm(f => ({ ...f, description: e.target.value }))}
                        className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground h-16 resize-none" />
                    </div>
                    <div>
                      <Label>חומרה</Label>
                      <select value={findingForm.severity} onChange={e => setFindingForm(f => ({ ...f, severity: e.target.value }))}
                        className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
                        {Object.entries(SEVERITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </div>
                    <div><Label>סעיף</Label><Input value={findingForm.clause} onChange={e => setFindingForm(f => ({ ...f, clause: e.target.value }))} className="bg-background/50" /></div>
                    <div><Label>אחראי</Label><Input value={findingForm.responsiblePerson} onChange={e => setFindingForm(f => ({ ...f, responsiblePerson: e.target.value }))} className="bg-background/50" /></div>
                    <div><Label>תאריך יעד</Label><Input type="date" value={findingForm.dueDate} onChange={e => setFindingForm(f => ({ ...f, dueDate: e.target.value }))} className="bg-background/50" /></div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" size="sm" onClick={() => setShowFindingForm(false)}>ביטול</Button>
                    <Button size="sm" onClick={handleSaveFinding} disabled={saving || !findingForm.description}><Save className="w-4 h-4 ml-1" />שמור</Button>
                  </div>
                </div>
              )}

              <h3 className="font-medium text-foreground mb-3">ממצאים ({findings.length})</h3>
              {findingsLoading ? <div className="text-center py-8 text-muted-foreground">טוען...</div> :
                findings.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">אין ממצאים עדיין</div>
                ) : (
                  <div className="space-y-3">
                    {findings.map(f => (
                      <div key={f.id} className="border border-border/50 rounded-lg overflow-hidden">
                        <div className="p-3 bg-background/30 flex items-center justify-between cursor-pointer"
                          onClick={() => setExpandedFindings(s => { const n = new Set(s); n.has(f.id) ? n.delete(f.id) : n.add(f.id); return n; })}>
                          <div className="flex items-center gap-2">
                            <Badge className={SEVERITY_COLORS[f.severity] || "bg-gray-500/20"}>{SEVERITY_LABELS[f.severity] || f.severity}</Badge>
                            <span className="text-sm font-medium text-foreground">{f.description}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className={FINDING_STATUS_COLORS[f.status] || "bg-gray-500/20"}>
                              {f.status === "open" ? "פתוח" : f.status === "in_progress" ? "בטיפול" : "סגור"}
                            </Badge>
                            {expandedFindings.has(f.id) ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </div>
                        </div>

                        {expandedFindings.has(f.id) && (
                          <div className="p-3 border-t border-border/30 space-y-3">
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              {f.clause && <div><span className="text-muted-foreground">סעיף: </span>{f.clause}</div>}
                              {f.responsible_person && <div><span className="text-muted-foreground">אחראי: </span>{f.responsible_person}</div>}
                              {f.due_date && <div><span className="text-muted-foreground">יעד: </span>{new Date(f.due_date).toLocaleDateString("he-IL")}</div>}
                            </div>

                            <div className="flex gap-2">
                              {["open", "in_progress", "closed"].map(s => (
                                <Button key={s} variant="outline" size="sm"
                                  className={f.status === s ? "border-primary text-primary" : ""}
                                  onClick={() => updateFindingStatus(f.id, s)}>
                                  {s === "open" ? "פתוח" : s === "in_progress" ? "בטיפול" : "סגור"}
                                </Button>
                              ))}
                              <Button size="sm" variant="outline" onClick={() => setShowCAForm(f.id)}>
                                <Plus className="w-3 h-3 ml-1" />פעולה מתקנת
                              </Button>
                            </div>

                            {showCAForm === f.id && (
                              <div className="p-3 bg-background/50 rounded-lg space-y-2">
                                <h4 className="text-sm font-medium text-foreground">פעולה מתקנת חדשה</h4>
                                <Input placeholder="תיאור הפעולה" value={caForm.description} onChange={e => setCaForm(c => ({ ...c, description: e.target.value }))} className="bg-background/50 text-sm" />
                                <div className="grid grid-cols-2 gap-2">
                                  <Input placeholder="אחראי" value={caForm.assignedTo} onChange={e => setCaForm(c => ({ ...c, assignedTo: e.target.value }))} className="bg-background/50 text-sm" />
                                  <Input type="date" value={caForm.dueDate} onChange={e => setCaForm(c => ({ ...c, dueDate: e.target.value }))} className="bg-background/50 text-sm" />
                                </div>
                                <div className="flex gap-2 justify-end">
                                  <Button variant="outline" size="sm" onClick={() => setShowCAForm(null)}>ביטול</Button>
                                  <Button size="sm" onClick={() => handleSaveCA(f.id)} disabled={saving || !caForm.description}>שמור</Button>
                                </div>
                              </div>
                            )}

                            {(f.corrective_actions || []).length > 0 && (
                              <div className="space-y-2">
                                <h4 className="text-xs font-medium text-muted-foreground">פעולות מתקנות</h4>
                                {(f.corrective_actions || []).map(ca => (
                                  <div key={ca.id} className="flex items-center justify-between p-2 bg-background/20 rounded text-sm">
                                    <span className="text-foreground">{ca.description}</span>
                                    <div className="flex items-center gap-2">
                                      {ca.assigned_to && <span className="text-muted-foreground text-xs">{ca.assigned_to}</span>}
                                      <Badge className={ca.status === "open" ? "bg-red-500/20 text-red-300" : "bg-green-500/20 text-green-300"} >
                                        {ca.status === "open" ? "פתוח" : "סגור"}
                                      </Badge>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Add/Edit Audit Form */}
      {showAuditForm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-xl bg-card border-border max-h-[90vh] flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-foreground">{editId ? "עריכת ביקורת" : "ביקורת חדשה"}</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => { setShowAuditForm(false); setEditId(null); }}><X className="w-4 h-4" /></Button>
            </CardHeader>
            <CardContent className="overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2"><Label>תחום הביקורת *</Label><Input value={form.scope} onChange={e => setForm(f => ({ ...f, scope: e.target.value }))} className="bg-background/50" /></div>
                <div><Label>מבקר</Label><Input value={form.auditor} onChange={e => setForm(f => ({ ...f, auditor: e.target.value }))} className="bg-background/50" /></div>
                <div><Label>נבדק</Label><Input value={form.auditee} onChange={e => setForm(f => ({ ...f, auditee: e.target.value }))} className="bg-background/50" /></div>
                <div><Label>תאריך מתוכנן</Label><Input type="date" value={form.scheduledDate} onChange={e => setForm(f => ({ ...f, scheduledDate: e.target.value }))} className="bg-background/50" /></div>
                <div><Label>תאריך ביצוע</Label><Input type="date" value={form.executionDate} onChange={e => setForm(f => ({ ...f, executionDate: e.target.value }))} className="bg-background/50" /></div>
                <div>
                  <Label>סטטוס</Label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                    className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
                    {Object.entries(AUDIT_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <Label>סוג ביקורת</Label>
                  <select value={form.auditType} onChange={e => setForm(f => ({ ...f, auditType: e.target.value }))}
                    className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
                    <option value="internal">פנימית</option>
                    <option value="external">חיצונית</option>
                    <option value="regulatory">רגולטורית</option>
                  </select>
                </div>
              </div>
              <div className="mt-4">
                <Label>הערות</Label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground h-20 resize-none" />
              </div>
              <div className="flex gap-2 justify-end mt-4">
                <Button variant="outline" onClick={() => { setShowAuditForm(false); setEditId(null); }}>ביטול</Button>
                <Button onClick={handleSaveAudit} disabled={saving || !form.scope}>
                  <Save className="w-4 h-4 ml-1" />{saving ? "שומר..." : "שמור"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
