import { useState, useMemo, useEffect, useCallback } from "react";
import { authFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus, Search, X, Save, Eye, Edit2, Trash2, Loader2, AlertCircle,
  ChevronsUpDown, FileSpreadsheet, Printer, Upload, Download,
  CheckCircle2, Clock, Send, ShieldCheck, ShieldX, ArrowRight,
  Settings2, BarChart3, Wrench, GitBranch, ClipboardList, Target,
  ChevronRight, ChevronLeft
} from "lucide-react";

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft: { label: "טיוטה", color: "bg-gray-500/20 text-gray-300" },
  submitted: { label: "הוגש", color: "bg-blue-500/20 text-blue-300" },
  under_review: { label: "בבדיקה", color: "bg-yellow-500/20 text-yellow-300" },
  approved: { label: "מאושר", color: "bg-green-500/20 text-green-300" },
  rejected: { label: "נדחה", color: "bg-red-500/20 text-red-300" },
  implemented: { label: "יושם", color: "bg-emerald-500/20 text-emerald-300" },
  closed: { label: "סגור", color: "bg-slate-500/20 text-slate-300" },
};

const PRIORITY_MAP: Record<string, { label: string; color: string }> = {
  critical: { label: "קריטי", color: "bg-red-600/20 text-red-300" },
  high: { label: "גבוה", color: "bg-orange-500/20 text-orange-300" },
  medium: { label: "בינוני", color: "bg-yellow-500/20 text-yellow-300" },
  low: { label: "נמוך", color: "bg-green-500/20 text-green-300" },
};

const TYPE_MAP: Record<string, string> = {
  design: "עיצוב / תכנון",
  process: "תהליך",
  material: "חומר",
  quality: "איכות",
};

const TYPES = ["design", "process", "material", "quality"];
const PRIORITIES = ["critical", "high", "medium", "low"];
const STATUSES = ["draft", "submitted", "under_review", "approved", "rejected", "implemented", "closed"];
const EMP = ["יוסי כהן", "שרה לוי", "דוד מזרחי", "רחל אברהם", "אלון גולדשטיין", "מיכל ברק", "עומר חדד", "נועה פרידמן"];

export default function EngineeringChange() {
  const [data, setData] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({});
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [perPage] = useState(25);
  const [showCreate, setShowCreate] = useState(false);
  const [showDetail, setShowDetail] = useState<any>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<any>(null);
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [isLoading, setIsLoading] = useState(true);
  const [tab, setTab] = useState<"ecr" | "eco" | "impact">("ecr");
  const [impactForm, setImpactForm] = useState<any>({});
  const [showImpact, setShowImpact] = useState(false);
  const [impacts, setImpacts] = useState<any[]>([]);
  const [approvals, setApprovals] = useState<any[]>([]);

  const toggleSort = (f: string) => {
    if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(f); setSortDir("desc"); }
  };

  const load = useCallback(async () => {
    try {
      setError(null);
      const [ecrRes, statsRes] = await Promise.all([
        authFetch("/api/engineering-change/ecr"),
        authFetch("/api/engineering-change/dashboard"),
      ]);
      if (ecrRes.ok) {
        const j = await ecrRes.json();
        setData(Array.isArray(j) ? j : j.data || j.items || []);
      }
      if (statsRes.ok) {
        const j = await statsRes.json();
        setStats(j.stats || {});
      }
    } catch (e: any) { setError(e.message); }
    setIsLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    let d = [...data];
    if (search) {
      const s = search.toLowerCase();
      d = d.filter(r => r.ecr_number?.toLowerCase().includes(s) || r.title?.toLowerCase().includes(s) || r.requested_by?.toLowerCase().includes(s) || r.assigned_to?.toLowerCase().includes(s));
    }
    if (statusFilter !== "all") d = d.filter(r => r.status === statusFilter);
    if (typeFilter !== "all") d = d.filter(r => r.type === typeFilter);
    if (priorityFilter !== "all") d = d.filter(r => r.priority === priorityFilter);
    if (sortField) d.sort((a: any, b: any) => {
      const av = a[sortField], bv = b[sortField];
      const cmp = typeof av === "number" ? av - bv : String(av || "").localeCompare(String(bv || ""), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return d;
  }, [data, search, statusFilter, typeFilter, priorityFilter, sortField, sortDir]);

  const tp = Math.ceil(filtered.length / perPage);
  const pd = filtered.slice((page - 1) * perPage, page * perPage);

  const handleSave = async () => {
    setSaving(true);
    try {
      const method = editId ? "PUT" : "POST";
      const url = editId ? `/api/engineering-change/ecr/${editId}` : "/api/engineering-change/ecr";
      const res = await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "שגיאה בשמירה"); }
      setShowCreate(false); setEditId(null); setForm({});
      await load();
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };

  const handleDelete = async (id: any) => {
    try {
      await authFetch(`/api/engineering-change/ecr/${id}`, { method: "DELETE" });
      setDeleteConfirm(null);
      await load();
    } catch (e: any) { setError(e.message); }
  };

  const handleWorkflow = async (id: number, action: string, body?: any) => {
    try {
      const res = await authFetch(`/api/engineering-change/ecr/${id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body || {}),
      });
      if (!res.ok) throw new Error("שגיאה בפעולה");
      await load();
      if (showDetail) {
        const updated = await authFetch(`/api/engineering-change/ecr/${id}`);
        if (updated.ok) setShowDetail(await updated.json());
      }
    } catch (e: any) { setError(e.message); }
  };

  const loadImpacts = async (ecrId: number) => {
    const res = await authFetch(`/api/engineering-change/ecr/${ecrId}/impact`);
    if (res.ok) setImpacts(await res.json());
  };

  const loadApprovals = async (ecrId: number) => {
    const res = await authFetch(`/api/engineering-change/ecr/${ecrId}/approvals`);
    if (res.ok) setApprovals(await res.json());
  };

  const handleSaveImpact = async (ecrId: number) => {
    setSaving(true);
    try {
      await authFetch(`/api/engineering-change/ecr/${ecrId}/impact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(impactForm),
      });
      setImpactForm({});
      setShowImpact(false);
      await loadImpacts(ecrId);
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };

  const openDetail = async (row: any) => {
    setShowDetail(row);
    await Promise.all([loadImpacts(row.id), loadApprovals(row.id)]);
  };

  const SI = () => <ChevronsUpDown className="h-3 w-3 opacity-40 inline mr-1" />;

  return (
    <div className="p-6 space-y-4" dir="rtl">
      {error && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span className="text-sm">{error}</span>
          <button onClick={() => setError(null)} className="mr-auto"><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <GitBranch className="h-6 w-6 text-blue-400" />
            ניהול שינויים הנדסיים (ECR/ECO)
          </h1>
          <p className="text-sm text-muted-foreground mt-1">בקשות שינוי הנדסי, אישורים, ניתוח השפעה ויישום</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="border-[#2a2a3e] text-gray-300 gap-1"><FileSpreadsheet className="h-4 w-4" />ייצוא</Button>
          <Button variant="outline" size="sm" className="border-[#2a2a3e] text-gray-300 gap-1"><Printer className="h-4 w-4" />הדפסה</Button>
          <Button onClick={() => { setForm({}); setEditId(null); setShowCreate(true); }} className="bg-blue-600 hover:bg-blue-700 gap-2">
            <Plus className="h-4 w-4" />ECR חדש
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-[#1a1a2e] border-[#2a2a3e]">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">ECR פתוחים</p>
                <p className="text-2xl font-bold text-white">{stats.open_ecrs || 0}</p>
              </div>
              <ClipboardList className="h-8 w-8 text-blue-400 opacity-60" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-[#1a1a2e] border-[#2a2a3e]">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">ממתין לאישור</p>
                <p className="text-2xl font-bold text-yellow-400">{stats.pending_approval || 0}</p>
              </div>
              <Clock className="h-8 w-8 text-yellow-400 opacity-60" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-[#1a1a2e] border-[#2a2a3e]">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">יושמו החודש</p>
                <p className="text-2xl font-bold text-green-400">{stats.implemented_this_month || 0}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-400 opacity-60" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-[#1a1a2e] border-[#2a2a3e]">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">זמן טיפול ממוצע</p>
                <p className="text-2xl font-bold text-purple-400">{stats.avg_processing_days || 0} ימים</p>
              </div>
              <BarChart3 className="h-8 w-8 text-purple-400 opacity-60" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="bg-[#1a1a2e] border-[#2a2a3e]">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="חיפוש לפי מספר, כותרת, מבקש..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pr-9 bg-[#0f0f1a] border-[#2a2a3e] text-white" />
            </div>
            <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="bg-[#0f0f1a] border border-[#2a2a3e] text-white rounded-md px-3 py-2 text-sm">
              <option value="all">כל הסטטוסים</option>
              {STATUSES.map(st => <option key={st} value={st}>{STATUS_MAP[st]?.label}</option>)}
            </select>
            <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }} className="bg-[#0f0f1a] border border-[#2a2a3e] text-white rounded-md px-3 py-2 text-sm">
              <option value="all">כל הסוגים</option>
              {TYPES.map(t => <option key={t} value={t}>{TYPE_MAP[t]}</option>)}
            </select>
            <select value={priorityFilter} onChange={e => { setPriorityFilter(e.target.value); setPage(1); }} className="bg-[#0f0f1a] border border-[#2a2a3e] text-white rounded-md px-3 py-2 text-sm">
              <option value="all">כל העדיפויות</option>
              {PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_MAP[p]?.label}</option>)}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="bg-[#1a1a2e] border-[#2a2a3e]">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-blue-400" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#2a2a3e] text-muted-foreground">
                    <th className="text-right p-3 cursor-pointer hover:text-white" onClick={() => toggleSort("ecr_number")}><SI />מספר ECR</th>
                    <th className="text-right p-3 cursor-pointer hover:text-white" onClick={() => toggleSort("title")}><SI />כותרת</th>
                    <th className="text-right p-3 cursor-pointer hover:text-white" onClick={() => toggleSort("type")}><SI />סוג</th>
                    <th className="text-right p-3 cursor-pointer hover:text-white" onClick={() => toggleSort("priority")}><SI />עדיפות</th>
                    <th className="text-right p-3 cursor-pointer hover:text-white" onClick={() => toggleSort("status")}><SI />סטטוס</th>
                    <th className="text-right p-3">מבקש</th>
                    <th className="text-right p-3">אחראי</th>
                    <th className="text-right p-3 cursor-pointer hover:text-white" onClick={() => toggleSort("cost_impact")}><SI />עלות</th>
                    <th className="text-right p-3">תאריך</th>
                    <th className="text-center p-3">פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {pd.length === 0 ? (
                    <tr><td colSpan={10} className="text-center p-8 text-muted-foreground">לא נמצאו בקשות שינוי</td></tr>
                  ) : pd.map((r: any) => (
                    <tr key={r.id} className="border-b border-[#2a2a3e]/50 hover:bg-[#2a2a3e]/30 transition-colors">
                      <td className="p-3 font-mono text-blue-400">{r.ecr_number}</td>
                      <td className="p-3 text-white max-w-[200px] truncate">{r.title}</td>
                      <td className="p-3"><Badge variant="outline" className="text-xs">{TYPE_MAP[r.type] || r.type}</Badge></td>
                      <td className="p-3"><Badge className={`text-xs ${PRIORITY_MAP[r.priority]?.color || ""}`}>{PRIORITY_MAP[r.priority]?.label || r.priority}</Badge></td>
                      <td className="p-3"><Badge className={`text-xs ${STATUS_MAP[r.status]?.color || ""}`}>{STATUS_MAP[r.status]?.label || r.status}</Badge></td>
                      <td className="p-3 text-muted-foreground">{r.requested_by}</td>
                      <td className="p-3 text-muted-foreground">{r.assigned_to || "-"}</td>
                      <td className="p-3 text-white">{r.cost_impact ? `${Number(r.cost_impact).toLocaleString()} ILS` : "-"}</td>
                      <td className="p-3 text-muted-foreground text-xs">{r.created_at ? new Date(r.created_at).toLocaleDateString("he-IL") : ""}</td>
                      <td className="p-3">
                        <div className="flex gap-1 justify-center">
                          <Button variant="ghost" size="sm" onClick={() => openDetail(r)}><Eye className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="sm" onClick={() => { setForm(r); setEditId(r.id); setShowCreate(true); }}><Edit2 className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="sm" className="text-red-400" onClick={() => setDeleteConfirm(r)}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {/* Pagination */}
          {tp > 1 && (
            <div className="flex items-center justify-between p-3 border-t border-[#2a2a3e]">
              <span className="text-xs text-muted-foreground">{filtered.length} תוצאות | עמוד {page} מתוך {tp}</span>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronRight className="h-4 w-4" /></Button>
                <Button variant="ghost" size="sm" disabled={page >= tp} onClick={() => setPage(p => p + 1)}><ChevronLeft className="h-4 w-4" /></Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <Card className="bg-[#1a1a2e] border-[#2a2a3e] w-[400px]">
            <CardContent className="p-6 space-y-4">
              <h3 className="text-lg font-bold text-white">אישור מחיקה</h3>
              <p className="text-muted-foreground">האם למחוק את ECR {deleteConfirm.ecr_number}?</p>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setDeleteConfirm(null)}>ביטול</Button>
                <Button variant="destructive" onClick={() => handleDelete(deleteConfirm.id)}>מחק</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Create / Edit Dialog */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 overflow-y-auto p-4">
          <Card className="bg-[#1a1a2e] border-[#2a2a3e] w-full max-w-[700px] my-8">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">{editId ? "עריכת ECR" : "בקשת שינוי הנדסי חדשה"}</h3>
                <Button variant="ghost" size="sm" onClick={() => { setShowCreate(false); setEditId(null); setForm({}); }}><X className="h-4 w-4" /></Button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label className="text-muted-foreground">כותרת *</Label>
                  <Input value={form.title || ""} onChange={e => setForm({ ...form, title: e.target.value })} className="bg-[#0f0f1a] border-[#2a2a3e] text-white" placeholder="תיאור קצר של השינוי" />
                </div>
                <div className="col-span-2">
                  <Label className="text-muted-foreground">תיאור</Label>
                  <Textarea value={form.description || ""} onChange={e => setForm({ ...form, description: e.target.value })} className="bg-[#0f0f1a] border-[#2a2a3e] text-white" rows={3} />
                </div>
                <div>
                  <Label className="text-muted-foreground">סוג שינוי</Label>
                  <select value={form.type || "design"} onChange={e => setForm({ ...form, type: e.target.value })} className="w-full bg-[#0f0f1a] border border-[#2a2a3e] text-white rounded-md px-3 py-2 text-sm">
                    {TYPES.map(t => <option key={t} value={t}>{TYPE_MAP[t]}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-muted-foreground">עדיפות</Label>
                  <select value={form.priority || "medium"} onChange={e => setForm({ ...form, priority: e.target.value })} className="w-full bg-[#0f0f1a] border border-[#2a2a3e] text-white rounded-md px-3 py-2 text-sm">
                    {PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_MAP[p].label}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-muted-foreground">מבקש</Label>
                  <select value={form.requested_by || ""} onChange={e => setForm({ ...form, requested_by: e.target.value })} className="w-full bg-[#0f0f1a] border border-[#2a2a3e] text-white rounded-md px-3 py-2 text-sm">
                    <option value="">בחר מבקש</option>
                    {EMP.map(e => <option key={e} value={e}>{e}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-muted-foreground">אחראי</Label>
                  <select value={form.assigned_to || ""} onChange={e => setForm({ ...form, assigned_to: e.target.value })} className="w-full bg-[#0f0f1a] border border-[#2a2a3e] text-white rounded-md px-3 py-2 text-sm">
                    <option value="">בחר אחראי</option>
                    {EMP.map(e => <option key={e} value={e}>{e}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-muted-foreground">תאריך יישום</Label>
                  <Input type="date" value={form.implementation_date || ""} onChange={e => setForm({ ...form, implementation_date: e.target.value })} className="bg-[#0f0f1a] border-[#2a2a3e] text-white" />
                </div>
                <div>
                  <Label className="text-muted-foreground">השפעת עלות (ILS)</Label>
                  <Input type="number" value={form.cost_impact || ""} onChange={e => setForm({ ...form, cost_impact: parseFloat(e.target.value) || 0 })} className="bg-[#0f0f1a] border-[#2a2a3e] text-white" />
                </div>
                <div>
                  <Label className="text-muted-foreground">רמת סיכון</Label>
                  <select value={form.risk_level || "low"} onChange={e => setForm({ ...form, risk_level: e.target.value })} className="w-full bg-[#0f0f1a] border border-[#2a2a3e] text-white rounded-md px-3 py-2 text-sm">
                    <option value="low">נמוך</option>
                    <option value="medium">בינוני</option>
                    <option value="high">גבוה</option>
                    <option value="critical">קריטי</option>
                  </select>
                </div>
                <div>
                  <Label className="text-muted-foreground">פריטים מושפעים (BOM / מוצרים)</Label>
                  <Input value={form.affected_items_text || (Array.isArray(form.affected_items) ? form.affected_items.join(", ") : "") || ""} onChange={e => setForm({ ...form, affected_items_text: e.target.value, affected_items: e.target.value.split(",").map((x: string) => x.trim()).filter(Boolean) })} className="bg-[#0f0f1a] border-[#2a2a3e] text-white" placeholder="הפרד בפסיקים" />
                </div>
                <div className="col-span-2">
                  <Label className="text-muted-foreground">סיבה / הצדקה</Label>
                  <Textarea value={form.reason || ""} onChange={e => setForm({ ...form, reason: e.target.value })} className="bg-[#0f0f1a] border-[#2a2a3e] text-white" rows={2} />
                </div>
                <div className="col-span-2">
                  <Label className="text-muted-foreground">ניתוח השפעה</Label>
                  <Textarea value={form.impact_analysis || ""} onChange={e => setForm({ ...form, impact_analysis: e.target.value })} className="bg-[#0f0f1a] border-[#2a2a3e] text-white" rows={2} />
                </div>
                <div className="col-span-2">
                  <Label className="text-muted-foreground">הערות</Label>
                  <Textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} className="bg-[#0f0f1a] border-[#2a2a3e] text-white" rows={2} />
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <Button variant="outline" onClick={() => { setShowCreate(false); setEditId(null); setForm({}); }}>ביטול</Button>
                <Button onClick={handleSave} disabled={saving || !form.title} className="bg-blue-600 hover:bg-blue-700 gap-2">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {editId ? "עדכן" : "צור ECR"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Detail View */}
      {showDetail && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 overflow-y-auto p-4">
          <Card className="bg-[#1a1a2e] border-[#2a2a3e] w-full max-w-[900px] my-8">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <span className="font-mono text-blue-400">{showDetail.ecr_number}</span>
                    {showDetail.title}
                  </h3>
                  <div className="flex gap-2 mt-1">
                    <Badge className={STATUS_MAP[showDetail.status]?.color}>{STATUS_MAP[showDetail.status]?.label}</Badge>
                    <Badge className={PRIORITY_MAP[showDetail.priority]?.color}>{PRIORITY_MAP[showDetail.priority]?.label}</Badge>
                    <Badge variant="outline">{TYPE_MAP[showDetail.type]}</Badge>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => { setShowDetail(null); setImpacts([]); setApprovals([]); }}><X className="h-5 w-5" /></Button>
              </div>

              {/* Workflow Actions */}
              <div className="flex gap-2 flex-wrap">
                {showDetail.status === "draft" && (
                  <Button size="sm" className="bg-blue-600 hover:bg-blue-700 gap-1" onClick={() => handleWorkflow(showDetail.id, "submit")}>
                    <Send className="h-4 w-4" />הגש לאישור
                  </Button>
                )}
                {(showDetail.status === "submitted" || showDetail.status === "under_review") && (
                  <>
                    <Button size="sm" className="bg-green-600 hover:bg-green-700 gap-1" onClick={() => handleWorkflow(showDetail.id, "approve")}>
                      <ShieldCheck className="h-4 w-4" />אשר
                    </Button>
                    <Button size="sm" className="bg-red-600 hover:bg-red-700 gap-1" onClick={() => handleWorkflow(showDetail.id, "reject")}>
                      <ShieldX className="h-4 w-4" />דחה
                    </Button>
                  </>
                )}
                {showDetail.status === "approved" && (
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 gap-1" onClick={() => handleWorkflow(showDetail.id, "implement")}>
                    <Wrench className="h-4 w-4" />סמן כיושם
                  </Button>
                )}
                {showDetail.status === "implemented" && (
                  <Button size="sm" className="bg-slate-600 hover:bg-slate-700 gap-1" onClick={() => handleWorkflow(showDetail.id, "close")}>
                    <CheckCircle2 className="h-4 w-4" />סגור
                  </Button>
                )}
              </div>

              {/* Tabs */}
              <div className="flex gap-1 border-b border-[#2a2a3e]">
                {(["ecr", "impact", "eco"] as const).map(t => (
                  <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm border-b-2 transition-colors ${tab === t ? "border-blue-500 text-white" : "border-transparent text-muted-foreground hover:text-white"}`}>
                    {t === "ecr" ? "פרטים" : t === "impact" ? `ניתוח השפעה (${impacts.length})` : "אישורים"}
                  </button>
                ))}
              </div>

              {tab === "ecr" && (
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><span className="text-muted-foreground">מבקש:</span> <span className="text-white mr-2">{showDetail.requested_by || "-"}</span></div>
                  <div><span className="text-muted-foreground">אחראי:</span> <span className="text-white mr-2">{showDetail.assigned_to || "-"}</span></div>
                  <div><span className="text-muted-foreground">תאריך יישום:</span> <span className="text-white mr-2">{showDetail.implementation_date ? new Date(showDetail.implementation_date).toLocaleDateString("he-IL") : "-"}</span></div>
                  <div><span className="text-muted-foreground">עלות:</span> <span className="text-white mr-2">{showDetail.cost_impact ? `${Number(showDetail.cost_impact).toLocaleString()} ILS` : "-"}</span></div>
                  <div><span className="text-muted-foreground">רמת סיכון:</span> <span className="text-white mr-2">{showDetail.risk_level || "-"}</span></div>
                  <div><span className="text-muted-foreground">נוצר:</span> <span className="text-white mr-2">{showDetail.created_at ? new Date(showDetail.created_at).toLocaleDateString("he-IL") : ""}</span></div>
                  {showDetail.description && <div className="col-span-2"><span className="text-muted-foreground">תיאור:</span><p className="text-white mt-1">{showDetail.description}</p></div>}
                  {showDetail.reason && <div className="col-span-2"><span className="text-muted-foreground">סיבה:</span><p className="text-white mt-1">{showDetail.reason}</p></div>}
                  {showDetail.impact_analysis && <div className="col-span-2"><span className="text-muted-foreground">ניתוח השפעה:</span><p className="text-white mt-1">{showDetail.impact_analysis}</p></div>}
                  {showDetail.affected_items && Array.isArray(JSON.parse(typeof showDetail.affected_items === "string" ? showDetail.affected_items : "[]")) && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">פריטים מושפעים:</span>
                      <div className="flex gap-1 flex-wrap mt-1">
                        {(typeof showDetail.affected_items === "string" ? JSON.parse(showDetail.affected_items) : showDetail.affected_items).map((item: string, i: number) => (
                          <Badge key={i} variant="outline" className="text-xs">{item}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {tab === "impact" && (
                <div className="space-y-3">
                  <Button size="sm" onClick={() => setShowImpact(true)} className="bg-blue-600 hover:bg-blue-700 gap-1"><Plus className="h-4 w-4" />הוסף ניתוח</Button>
                  {impacts.length === 0 ? (
                    <p className="text-muted-foreground text-sm p-4 text-center">אין ניתוחי השפעה</p>
                  ) : impacts.map((imp: any) => (
                    <Card key={imp.id} className="bg-[#0f0f1a] border-[#2a2a3e]">
                      <CardContent className="p-3 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-white font-medium">{imp.category}</span>
                          <Badge className={PRIORITY_MAP[imp.severity]?.color}>{imp.severity}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{imp.description}</p>
                        <div className="flex gap-4 text-xs text-muted-foreground">
                          <span>עלות: {imp.cost_estimate ? `${Number(imp.cost_estimate).toLocaleString()} ILS` : "-"}</span>
                          <span>זמן: {imp.time_estimate_days || 0} ימים</span>
                          <span>נותח ע"י: {imp.analyzed_by}</span>
                        </div>
                        {imp.risk_assessment && <p className="text-xs text-yellow-400">סיכון: {imp.risk_assessment}</p>}
                        {imp.mitigation_plan && <p className="text-xs text-green-400">מיטיגציה: {imp.mitigation_plan}</p>}
                      </CardContent>
                    </Card>
                  ))}
                  {showImpact && (
                    <Card className="bg-[#0f0f1a] border-blue-500/30">
                      <CardContent className="p-4 space-y-3">
                        <h4 className="text-white font-medium">ניתוח השפעה חדש</h4>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-xs text-muted-foreground">קטגוריה</Label>
                            <Input value={impactForm.category || ""} onChange={e => setImpactForm({ ...impactForm, category: e.target.value })} className="bg-[#1a1a2e] border-[#2a2a3e] text-white" placeholder="למשל: ייצור, איכות, עלות" />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">חומרה</Label>
                            <select value={impactForm.severity || "medium"} onChange={e => setImpactForm({ ...impactForm, severity: e.target.value })} className="w-full bg-[#1a1a2e] border border-[#2a2a3e] text-white rounded-md px-3 py-2 text-sm">
                              {PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_MAP[p].label}</option>)}
                            </select>
                          </div>
                          <div className="col-span-2">
                            <Label className="text-xs text-muted-foreground">תיאור</Label>
                            <Textarea value={impactForm.description || ""} onChange={e => setImpactForm({ ...impactForm, description: e.target.value })} className="bg-[#1a1a2e] border-[#2a2a3e] text-white" rows={2} />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">עלות משוערת</Label>
                            <Input type="number" value={impactForm.cost_estimate || ""} onChange={e => setImpactForm({ ...impactForm, cost_estimate: parseFloat(e.target.value) || 0 })} className="bg-[#1a1a2e] border-[#2a2a3e] text-white" />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">זמן משוער (ימים)</Label>
                            <Input type="number" value={impactForm.time_estimate_days || ""} onChange={e => setImpactForm({ ...impactForm, time_estimate_days: parseInt(e.target.value) || 0 })} className="bg-[#1a1a2e] border-[#2a2a3e] text-white" />
                          </div>
                          <div className="col-span-2">
                            <Label className="text-xs text-muted-foreground">הערכת סיכון</Label>
                            <Input value={impactForm.risk_assessment || ""} onChange={e => setImpactForm({ ...impactForm, risk_assessment: e.target.value })} className="bg-[#1a1a2e] border-[#2a2a3e] text-white" />
                          </div>
                          <div className="col-span-2">
                            <Label className="text-xs text-muted-foreground">תוכנית מיטיגציה</Label>
                            <Input value={impactForm.mitigation_plan || ""} onChange={e => setImpactForm({ ...impactForm, mitigation_plan: e.target.value })} className="bg-[#1a1a2e] border-[#2a2a3e] text-white" />
                          </div>
                        </div>
                        <div className="flex gap-2 justify-end">
                          <Button variant="outline" size="sm" onClick={() => { setShowImpact(false); setImpactForm({}); }}>ביטול</Button>
                          <Button size="sm" onClick={() => handleSaveImpact(showDetail.id)} disabled={saving} className="bg-blue-600 hover:bg-blue-700">שמור</Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}

              {tab === "eco" && (
                <div className="space-y-3">
                  {approvals.length === 0 ? (
                    <p className="text-muted-foreground text-sm p-4 text-center">אין אישורים</p>
                  ) : approvals.map((a: any) => (
                    <div key={a.id} className="flex items-center gap-3 p-3 bg-[#0f0f1a] border border-[#2a2a3e] rounded-lg">
                      {a.approval_status === "approved" ? <ShieldCheck className="h-5 w-5 text-green-400" /> : a.approval_status === "rejected" ? <ShieldX className="h-5 w-5 text-red-400" /> : <Clock className="h-5 w-5 text-yellow-400" />}
                      <div className="flex-1">
                        <span className="text-white">{a.approver_name}</span>
                        {a.approver_role && <span className="text-muted-foreground text-xs mr-2">({a.approver_role})</span>}
                        {a.comments && <p className="text-xs text-muted-foreground mt-0.5">{a.comments}</p>}
                      </div>
                      <Badge className={a.approval_status === "approved" ? "bg-green-500/20 text-green-300" : a.approval_status === "rejected" ? "bg-red-500/20 text-red-300" : "bg-yellow-500/20 text-yellow-300"}>
                        {a.approval_status === "approved" ? "מאושר" : a.approval_status === "rejected" ? "נדחה" : "ממתין"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{a.approved_at ? new Date(a.approved_at).toLocaleDateString("he-IL") : ""}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
