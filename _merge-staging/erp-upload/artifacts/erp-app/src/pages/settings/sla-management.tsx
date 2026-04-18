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
  ChevronsUpDown, FileSpreadsheet, Printer,
  Shield, Clock, AlertTriangle, BarChart3, Target,
  Bell, TrendingUp, CheckCircle2, XCircle,
  ChevronRight, ChevronLeft, ArrowUpRight, Zap
} from "lucide-react";

const MODULE_MAP: Record<string, string> = {
  crm: "CRM",
  support: "תמיכה",
  procurement: "רכש",
  production: "ייצור",
  logistics: "לוגיסטיקה",
  finance: "כספים",
};

const METRIC_MAP: Record<string, string> = {
  response_time: "זמן תגובה",
  resolution_time: "זמן פתרון",
  delivery_time: "זמן אספקה",
  quality_score: "ציון איכות",
  uptime: "זמינות",
  throughput: "תפוקה",
};

const UNIT_MAP: Record<string, string> = {
  hours: "שעות",
  days: "ימים",
  percentage: "אחוזים",
  minutes: "דקות",
};

const SEVERITY_MAP: Record<string, { label: string; color: string }> = {
  critical: { label: "קריטי", color: "bg-red-600/20 text-red-300" },
  high: { label: "גבוה", color: "bg-orange-500/20 text-orange-300" },
  medium: { label: "בינוני", color: "bg-yellow-500/20 text-yellow-300" },
  low: { label: "נמוך", color: "bg-green-500/20 text-green-300" },
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-500/20 text-green-300",
  inactive: "bg-gray-500/20 text-gray-300",
  paused: "bg-yellow-500/20 text-yellow-300",
};

const MODULES = ["crm", "support", "procurement", "production", "logistics", "finance"];
const METRICS = ["response_time", "resolution_time", "delivery_time", "quality_score", "uptime", "throughput"];
const UNITS = ["hours", "days", "percentage", "minutes"];
const SEVERITIES = ["critical", "high", "medium", "low"];
const EMP = ["יוסי כהן", "שרה לוי", "דוד מזרחי", "רחל אברהם", "אלון גולדשטיין", "מיכל ברק", "עומר חדד", "נועה פרידמן"];

export default function SlaManagement() {
  const [definitions, setDefinitions] = useState<any[]>([]);
  const [breaches, setBreaches] = useState<any[]>([]);
  const [escalationRules, setEscalationRules] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({});
  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [perPage] = useState(25);
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<any>(null);
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"definitions" | "breaches" | "escalation">("definitions");
  const [showBreachDetail, setShowBreachDetail] = useState<any>(null);
  const [escForm, setEscForm] = useState<any>({});
  const [showEscCreate, setShowEscCreate] = useState(false);

  const toggleSort = (f: string) => {
    if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(f); setSortDir("desc"); }
  };

  const load = useCallback(async () => {
    try {
      setError(null);
      const [defRes, dashRes, breachRes, escRes] = await Promise.all([
        authFetch("/api/sla-management/definitions"),
        authFetch("/api/sla-management/dashboard"),
        authFetch("/api/sla-management/breaches"),
        authFetch("/api/sla-management/escalation-rules"),
      ]);
      if (defRes.ok) {
        const j = await defRes.json();
        setDefinitions(Array.isArray(j) ? j : j.data || []);
      }
      if (dashRes.ok) {
        const j = await dashRes.json();
        setStats(j.stats || {});
      }
      if (breachRes.ok) {
        const j = await breachRes.json();
        setBreaches(Array.isArray(j) ? j : j.data || []);
      }
      if (escRes.ok) {
        const j = await escRes.json();
        setEscalationRules(Array.isArray(j) ? j : j.data || []);
      }
    } catch (e: any) { setError(e.message); }
    setIsLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    let d = [...definitions];
    if (search) {
      const s = search.toLowerCase();
      d = d.filter(r => r.sla_name?.toLowerCase().includes(s) || r.description?.toLowerCase().includes(s) || r.module?.toLowerCase().includes(s));
    }
    if (moduleFilter !== "all") d = d.filter(r => r.module === moduleFilter);
    if (sortField) d.sort((a: any, b: any) => {
      const av = a[sortField], bv = b[sortField];
      const cmp = typeof av === "number" ? av - bv : String(av || "").localeCompare(String(bv || ""), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return d;
  }, [definitions, search, moduleFilter, sortField, sortDir]);

  const tp = Math.ceil(filtered.length / perPage);
  const pd = filtered.slice((page - 1) * perPage, page * perPage);

  const handleSave = async () => {
    setSaving(true);
    try {
      const method = editId ? "PUT" : "POST";
      const url = editId ? `/api/sla-management/definitions/${editId}` : "/api/sla-management/definitions";
      const res = await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "שגיאה בשמירה"); }
      setShowCreate(false); setEditId(null); setForm({});
      await load();
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };

  const handleDelete = async (id: any) => {
    try {
      await authFetch(`/api/sla-management/definitions/${id}`, { method: "DELETE" });
      setDeleteConfirm(null);
      await load();
    } catch (e: any) { setError(e.message); }
  };

  const handleResolveBreach = async (id: number, notes: string) => {
    try {
      await authFetch(`/api/sla-management/breaches/${id}/resolve`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolution_notes: notes }),
      });
      setShowBreachDetail(null);
      await load();
    } catch (e: any) { setError(e.message); }
  };

  const handleSaveEscalation = async () => {
    setSaving(true);
    try {
      await authFetch("/api/sla-management/escalation-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(escForm),
      });
      setShowEscCreate(false); setEscForm({});
      await load();
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };

  const handleDeleteEscalation = async (id: number) => {
    try {
      await authFetch(`/api/sla-management/escalation-rules/${id}`, { method: "DELETE" });
      await load();
    } catch (e: any) { setError(e.message); }
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
            <Shield className="h-6 w-6 text-blue-400" />
            ניהול הסכמי רמת שירות (SLA)
          </h1>
          <p className="text-sm text-muted-foreground mt-1">הגדרת SLA, מעקב עמידה ביעדים, הפרות ואסקלציות</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="border-[#2a2a3e] text-gray-300 gap-1"><FileSpreadsheet className="h-4 w-4" />ייצוא</Button>
          <Button onClick={() => { setForm({}); setEditId(null); setShowCreate(true); }} className="bg-blue-600 hover:bg-blue-700 gap-2">
            <Plus className="h-4 w-4" />SLA חדש
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-[#1a1a2e] border-[#2a2a3e]">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">SLA פעילים</p>
                <p className="text-2xl font-bold text-white">{stats.active_slas || 0}</p>
              </div>
              <Target className="h-8 w-8 text-blue-400 opacity-60" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-[#1a1a2e] border-[#2a2a3e]">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">שיעור עמידה</p>
                <p className="text-2xl font-bold text-green-400">{stats.compliance_rate || 100}%</p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-400 opacity-60" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-[#1a1a2e] border-[#2a2a3e]">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">הפרות החודש</p>
                <p className="text-2xl font-bold text-red-400">{stats.breaches_this_month || 0}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-400 opacity-60" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-[#1a1a2e] border-[#2a2a3e]">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">הפרות פתוחות</p>
                <p className="text-2xl font-bold text-orange-400">{stats.open_breaches || 0}</p>
              </div>
              <Clock className="h-8 w-8 text-orange-400 opacity-60" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[#2a2a3e]">
        {([
          { key: "definitions", label: "הגדרות SLA", icon: Target },
          { key: "breaches", label: `הפרות (${breaches.filter((b: any) => b.resolution_status === "open").length})`, icon: AlertTriangle },
          { key: "escalation", label: "כללי אסקלציה", icon: Zap },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)} className={`flex items-center gap-1.5 px-4 py-2.5 text-sm border-b-2 transition-colors ${activeTab === t.key ? "border-blue-500 text-white" : "border-transparent text-muted-foreground hover:text-white"}`}>
            <t.icon className="h-4 w-4" />{t.label}
          </button>
        ))}
      </div>

      {/* DEFINITIONS TAB */}
      {activeTab === "definitions" && (
        <>
          <Card className="bg-[#1a1a2e] border-[#2a2a3e]">
            <CardContent className="p-4">
              <div className="flex flex-wrap gap-3 items-center">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="חיפוש SLA..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pr-9 bg-[#0f0f1a] border-[#2a2a3e] text-white" />
                </div>
                <select value={moduleFilter} onChange={e => { setModuleFilter(e.target.value); setPage(1); }} className="bg-[#0f0f1a] border border-[#2a2a3e] text-white rounded-md px-3 py-2 text-sm">
                  <option value="all">כל המודולים</option>
                  {MODULES.map(m => <option key={m} value={m}>{MODULE_MAP[m]}</option>)}
                </select>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-[#1a1a2e] border-[#2a2a3e]">
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex items-center justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-blue-400" /></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#2a2a3e] text-muted-foreground">
                        <th className="text-right p-3 cursor-pointer hover:text-white" onClick={() => toggleSort("sla_name")}><SI />שם SLA</th>
                        <th className="text-right p-3 cursor-pointer hover:text-white" onClick={() => toggleSort("module")}><SI />מודול</th>
                        <th className="text-right p-3">סוג מדד</th>
                        <th className="text-right p-3 cursor-pointer hover:text-white" onClick={() => toggleSort("target_value")}><SI />יעד</th>
                        <th className="text-right p-3">סף אזהרה</th>
                        <th className="text-right p-3">סף הפרה</th>
                        <th className="text-right p-3">קנס</th>
                        <th className="text-right p-3">סטטוס</th>
                        <th className="text-right p-3">הקצאות</th>
                        <th className="text-right p-3">הפרות</th>
                        <th className="text-center p-3">פעולות</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pd.length === 0 ? (
                        <tr><td colSpan={11} className="text-center p-8 text-muted-foreground">לא הוגדרו SLA</td></tr>
                      ) : pd.map((r: any) => (
                        <tr key={r.id} className="border-b border-[#2a2a3e]/50 hover:bg-[#2a2a3e]/30 transition-colors">
                          <td className="p-3 text-white font-medium">{r.sla_name}</td>
                          <td className="p-3"><Badge variant="outline" className="text-xs">{MODULE_MAP[r.module] || r.module}</Badge></td>
                          <td className="p-3 text-muted-foreground">{METRIC_MAP[r.metric_type] || r.metric_type}</td>
                          <td className="p-3 text-white">{r.target_value} {UNIT_MAP[r.target_unit] || r.target_unit}</td>
                          <td className="p-3 text-yellow-400">{r.warning_threshold || "-"}</td>
                          <td className="p-3 text-red-400">{r.breach_threshold || "-"}</td>
                          <td className="p-3 text-white">{r.penalty_amount ? `${Number(r.penalty_amount).toLocaleString()} ILS` : "-"}</td>
                          <td className="p-3"><Badge className={`text-xs ${STATUS_COLORS[r.status] || ""}`}>{r.status === "active" ? "פעיל" : r.status === "inactive" ? "לא פעיל" : r.status}</Badge></td>
                          <td className="p-3 text-center text-muted-foreground">{r.active_assignments || 0}</td>
                          <td className="p-3 text-center">{(r.open_breaches || 0) > 0 ? <Badge className="bg-red-500/20 text-red-300 text-xs">{r.open_breaches}</Badge> : <span className="text-muted-foreground">0</span>}</td>
                          <td className="p-3">
                            <div className="flex gap-1 justify-center">
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
        </>
      )}

      {/* BREACHES TAB */}
      {activeTab === "breaches" && (
        <Card className="bg-[#1a1a2e] border-[#2a2a3e]">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#2a2a3e] text-muted-foreground">
                    <th className="text-right p-3">SLA</th>
                    <th className="text-right p-3">מודול</th>
                    <th className="text-right p-3">ישות</th>
                    <th className="text-right p-3">חומרה</th>
                    <th className="text-right p-3">צפוי</th>
                    <th className="text-right p-3">בפועל</th>
                    <th className="text-right p-3">קנס</th>
                    <th className="text-right p-3">סטטוס</th>
                    <th className="text-right p-3">תאריך</th>
                    <th className="text-center p-3">פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {breaches.length === 0 ? (
                    <tr><td colSpan={10} className="text-center p-8 text-muted-foreground">אין הפרות</td></tr>
                  ) : breaches.map((b: any) => (
                    <tr key={b.id} className="border-b border-[#2a2a3e]/50 hover:bg-[#2a2a3e]/30 transition-colors">
                      <td className="p-3 text-white">{b.sla_name}</td>
                      <td className="p-3"><Badge variant="outline" className="text-xs">{MODULE_MAP[b.module] || b.module}</Badge></td>
                      <td className="p-3 text-muted-foreground">{b.entity_name || b.entity_id || "-"}</td>
                      <td className="p-3"><Badge className={`text-xs ${SEVERITY_MAP[b.severity]?.color || ""}`}>{SEVERITY_MAP[b.severity]?.label || b.severity}</Badge></td>
                      <td className="p-3 text-green-400">{b.expected_value}</td>
                      <td className="p-3 text-red-400">{b.actual_value}</td>
                      <td className="p-3 text-white">{b.penalty_applied ? `${Number(b.penalty_applied).toLocaleString()} ILS` : "-"}</td>
                      <td className="p-3">
                        <Badge className={b.resolution_status === "open" ? "bg-red-500/20 text-red-300 text-xs" : b.resolution_status === "resolved" ? "bg-green-500/20 text-green-300 text-xs" : "bg-gray-500/20 text-gray-300 text-xs"}>
                          {b.resolution_status === "open" ? "פתוח" : b.resolution_status === "resolved" ? "נפתר" : b.resolution_status}
                        </Badge>
                      </td>
                      <td className="p-3 text-muted-foreground text-xs">{b.breach_at ? new Date(b.breach_at).toLocaleDateString("he-IL") : ""}</td>
                      <td className="p-3">
                        <div className="flex gap-1 justify-center">
                          {b.resolution_status === "open" && (
                            <Button variant="ghost" size="sm" className="text-green-400" onClick={() => setShowBreachDetail(b)}>
                              <CheckCircle2 className="h-4 w-4" />
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => setShowBreachDetail(b)}><Eye className="h-4 w-4" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ESCALATION TAB */}
      {activeTab === "escalation" && (
        <>
          <div className="flex justify-end">
            <Button onClick={() => { setEscForm({}); setShowEscCreate(true); }} className="bg-blue-600 hover:bg-blue-700 gap-2">
              <Plus className="h-4 w-4" />כלל אסקלציה חדש
            </Button>
          </div>
          <Card className="bg-[#1a1a2e] border-[#2a2a3e]">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#2a2a3e] text-muted-foreground">
                      <th className="text-right p-3">SLA</th>
                      <th className="text-right p-3">רמה</th>
                      <th className="text-right p-3">הפעלה אחרי (דקות)</th>
                      <th className="text-right p-3">סוג פעולה</th>
                      <th className="text-right p-3">הקצאה מחדש</th>
                      <th className="text-right p-3">סטטוס</th>
                      <th className="text-center p-3">פעולות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {escalationRules.length === 0 ? (
                      <tr><td colSpan={7} className="text-center p-8 text-muted-foreground">אין כללי אסקלציה</td></tr>
                    ) : escalationRules.map((r: any) => (
                      <tr key={r.id} className="border-b border-[#2a2a3e]/50 hover:bg-[#2a2a3e]/30 transition-colors">
                        <td className="p-3 text-white">{r.sla_name}</td>
                        <td className="p-3"><Badge variant="outline" className="text-xs">רמה {r.level}</Badge></td>
                        <td className="p-3 text-white">{r.trigger_after_minutes} דקות</td>
                        <td className="p-3 text-muted-foreground">{r.action_type === "notification" ? "התראה" : r.action_type === "reassign" ? "הקצאה מחדש" : r.action_type}</td>
                        <td className="p-3">{r.auto_reassign ? <span className="text-green-400">{r.reassign_to || "כן"}</span> : <span className="text-muted-foreground">לא</span>}</td>
                        <td className="p-3"><Badge className={`text-xs ${STATUS_COLORS[r.status] || ""}`}>{r.status === "active" ? "פעיל" : "לא פעיל"}</Badge></td>
                        <td className="p-3">
                          <div className="flex gap-1 justify-center">
                            <Button variant="ghost" size="sm" className="text-red-400" onClick={() => handleDeleteEscalation(r.id)}><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Delete Confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <Card className="bg-[#1a1a2e] border-[#2a2a3e] w-[400px]">
            <CardContent className="p-6 space-y-4">
              <h3 className="text-lg font-bold text-white">אישור מחיקה</h3>
              <p className="text-muted-foreground">האם למחוק את SLA "{deleteConfirm.sla_name}"? פעולה זו תמחק גם הפרות, הקצאות וכללי אסקלציה קשורים.</p>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setDeleteConfirm(null)}>ביטול</Button>
                <Button variant="destructive" onClick={() => handleDelete(deleteConfirm.id)}>מחק</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Create / Edit SLA Dialog */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 overflow-y-auto p-4">
          <Card className="bg-[#1a1a2e] border-[#2a2a3e] w-full max-w-[700px] my-8">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">{editId ? "עריכת SLA" : "הגדרת SLA חדש"}</h3>
                <Button variant="ghost" size="sm" onClick={() => { setShowCreate(false); setEditId(null); setForm({}); }}><X className="h-4 w-4" /></Button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label className="text-muted-foreground">שם SLA *</Label>
                  <Input value={form.sla_name || ""} onChange={e => setForm({ ...form, sla_name: e.target.value })} className="bg-[#0f0f1a] border-[#2a2a3e] text-white" placeholder='למשל: "זמן תגובה ראשוני - תמיכה"' />
                </div>
                <div className="col-span-2">
                  <Label className="text-muted-foreground">תיאור</Label>
                  <Textarea value={form.description || ""} onChange={e => setForm({ ...form, description: e.target.value })} className="bg-[#0f0f1a] border-[#2a2a3e] text-white" rows={2} />
                </div>
                <div>
                  <Label className="text-muted-foreground">מודול</Label>
                  <select value={form.module || "support"} onChange={e => setForm({ ...form, module: e.target.value })} className="w-full bg-[#0f0f1a] border border-[#2a2a3e] text-white rounded-md px-3 py-2 text-sm">
                    {MODULES.map(m => <option key={m} value={m}>{MODULE_MAP[m]}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-muted-foreground">סוג מדד</Label>
                  <select value={form.metric_type || "response_time"} onChange={e => setForm({ ...form, metric_type: e.target.value })} className="w-full bg-[#0f0f1a] border border-[#2a2a3e] text-white rounded-md px-3 py-2 text-sm">
                    {METRICS.map(m => <option key={m} value={m}>{METRIC_MAP[m]}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-muted-foreground">ערך יעד *</Label>
                  <Input type="number" value={form.target_value || ""} onChange={e => setForm({ ...form, target_value: parseFloat(e.target.value) || 0 })} className="bg-[#0f0f1a] border-[#2a2a3e] text-white" />
                </div>
                <div>
                  <Label className="text-muted-foreground">יחידת מדידה</Label>
                  <select value={form.target_unit || "hours"} onChange={e => setForm({ ...form, target_unit: e.target.value })} className="w-full bg-[#0f0f1a] border border-[#2a2a3e] text-white rounded-md px-3 py-2 text-sm">
                    {UNITS.map(u => <option key={u} value={u}>{UNIT_MAP[u]}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-muted-foreground">סף אזהרה</Label>
                  <Input type="number" value={form.warning_threshold || ""} onChange={e => setForm({ ...form, warning_threshold: parseFloat(e.target.value) || 0 })} className="bg-[#0f0f1a] border-[#2a2a3e] text-white" placeholder="ערך שמפעיל התראה" />
                </div>
                <div>
                  <Label className="text-muted-foreground">סף הפרה</Label>
                  <Input type="number" value={form.breach_threshold || ""} onChange={e => setForm({ ...form, breach_threshold: parseFloat(e.target.value) || 0 })} className="bg-[#0f0f1a] border-[#2a2a3e] text-white" placeholder="ערך שמהווה הפרה" />
                </div>
                <div>
                  <Label className="text-muted-foreground">סכום קנס (ILS)</Label>
                  <Input type="number" value={form.penalty_amount || ""} onChange={e => setForm({ ...form, penalty_amount: parseFloat(e.target.value) || 0 })} className="bg-[#0f0f1a] border-[#2a2a3e] text-white" />
                </div>
                <div>
                  <Label className="text-muted-foreground">עדיפות</Label>
                  <select value={form.priority || "medium"} onChange={e => setForm({ ...form, priority: e.target.value })} className="w-full bg-[#0f0f1a] border border-[#2a2a3e] text-white rounded-md px-3 py-2 text-sm">
                    {SEVERITIES.map(p => <option key={p} value={p}>{SEVERITY_MAP[p].label}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-muted-foreground">סטטוס</Label>
                  <select value={form.status || "active"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full bg-[#0f0f1a] border border-[#2a2a3e] text-white rounded-md px-3 py-2 text-sm">
                    <option value="active">פעיל</option>
                    <option value="inactive">לא פעיל</option>
                    <option value="paused">מושהה</option>
                  </select>
                </div>
                <div>
                  <Label className="text-muted-foreground">שעות עסקיות בלבד</Label>
                  <select value={form.business_hours_only !== false ? "true" : "false"} onChange={e => setForm({ ...form, business_hours_only: e.target.value === "true" })} className="w-full bg-[#0f0f1a] border border-[#2a2a3e] text-white rounded-md px-3 py-2 text-sm">
                    <option value="true">כן</option>
                    <option value="false">לא - 24/7</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <Button variant="outline" onClick={() => { setShowCreate(false); setEditId(null); setForm({}); }}>ביטול</Button>
                <Button onClick={handleSave} disabled={saving || !form.sla_name || !form.target_value} className="bg-blue-600 hover:bg-blue-700 gap-2">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {editId ? "עדכן" : "צור SLA"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Breach Resolve Dialog */}
      {showBreachDetail && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 overflow-y-auto p-4">
          <Card className="bg-[#1a1a2e] border-[#2a2a3e] w-full max-w-[500px]">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">פרטי הפרה</h3>
                <Button variant="ghost" size="sm" onClick={() => setShowBreachDetail(null)}><X className="h-4 w-4" /></Button>
              </div>
              <div className="space-y-2 text-sm">
                <div><span className="text-muted-foreground">SLA:</span> <span className="text-white mr-2">{showBreachDetail.sla_name}</span></div>
                <div><span className="text-muted-foreground">ישות:</span> <span className="text-white mr-2">{showBreachDetail.entity_name || showBreachDetail.entity_id || "-"}</span></div>
                <div><span className="text-muted-foreground">חומרה:</span> <Badge className={`mr-2 text-xs ${SEVERITY_MAP[showBreachDetail.severity]?.color}`}>{SEVERITY_MAP[showBreachDetail.severity]?.label}</Badge></div>
                <div><span className="text-muted-foreground">ערך צפוי:</span> <span className="text-green-400 mr-2">{showBreachDetail.expected_value}</span></div>
                <div><span className="text-muted-foreground">ערך בפועל:</span> <span className="text-red-400 mr-2">{showBreachDetail.actual_value}</span></div>
                <div><span className="text-muted-foreground">קנס:</span> <span className="text-white mr-2">{showBreachDetail.penalty_applied ? `${Number(showBreachDetail.penalty_applied).toLocaleString()} ILS` : "-"}</span></div>
                <div><span className="text-muted-foreground">תאריך:</span> <span className="text-white mr-2">{showBreachDetail.breach_at ? new Date(showBreachDetail.breach_at).toLocaleString("he-IL") : ""}</span></div>
              </div>
              {showBreachDetail.resolution_status === "open" && (
                <div className="space-y-2 pt-2 border-t border-[#2a2a3e]">
                  <Label className="text-muted-foreground">הערות פתרון</Label>
                  <Textarea id="resolveNotes" className="bg-[#0f0f1a] border-[#2a2a3e] text-white" rows={3} placeholder="תאר את הפתרון שננקט..." />
                  <Button className="bg-green-600 hover:bg-green-700 gap-1 w-full" onClick={() => {
                    const notes = (document.getElementById("resolveNotes") as HTMLTextAreaElement)?.value || "";
                    handleResolveBreach(showBreachDetail.id, notes);
                  }}>
                    <CheckCircle2 className="h-4 w-4" />סמן כנפתר
                  </Button>
                </div>
              )}
              {showBreachDetail.resolution_status === "resolved" && showBreachDetail.resolution_notes && (
                <div className="pt-2 border-t border-[#2a2a3e]">
                  <span className="text-muted-foreground text-sm">פתרון:</span>
                  <p className="text-white text-sm mt-1">{showBreachDetail.resolution_notes}</p>
                  <p className="text-xs text-muted-foreground mt-1">נפתר ע"י {showBreachDetail.resolved_by} ב-{showBreachDetail.resolved_at ? new Date(showBreachDetail.resolved_at).toLocaleString("he-IL") : ""}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Create Escalation Rule Dialog */}
      {showEscCreate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 overflow-y-auto p-4">
          <Card className="bg-[#1a1a2e] border-[#2a2a3e] w-full max-w-[500px]">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">כלל אסקלציה חדש</h3>
                <Button variant="ghost" size="sm" onClick={() => { setShowEscCreate(false); setEscForm({}); }}><X className="h-4 w-4" /></Button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label className="text-muted-foreground">SLA</Label>
                  <select value={escForm.sla_id || ""} onChange={e => setEscForm({ ...escForm, sla_id: parseInt(e.target.value) })} className="w-full bg-[#0f0f1a] border border-[#2a2a3e] text-white rounded-md px-3 py-2 text-sm">
                    <option value="">בחר SLA</option>
                    {definitions.filter(d => d.status === "active").map(d => <option key={d.id} value={d.id}>{d.sla_name}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-muted-foreground">רמת אסקלציה</Label>
                  <Input type="number" value={escForm.level || 1} onChange={e => setEscForm({ ...escForm, level: parseInt(e.target.value) || 1 })} className="bg-[#0f0f1a] border-[#2a2a3e] text-white" min={1} max={5} />
                </div>
                <div>
                  <Label className="text-muted-foreground">הפעלה אחרי (דקות)</Label>
                  <Input type="number" value={escForm.trigger_after_minutes || 60} onChange={e => setEscForm({ ...escForm, trigger_after_minutes: parseInt(e.target.value) || 60 })} className="bg-[#0f0f1a] border-[#2a2a3e] text-white" />
                </div>
                <div>
                  <Label className="text-muted-foreground">סוג פעולה</Label>
                  <select value={escForm.action_type || "notification"} onChange={e => setEscForm({ ...escForm, action_type: e.target.value })} className="w-full bg-[#0f0f1a] border border-[#2a2a3e] text-white rounded-md px-3 py-2 text-sm">
                    <option value="notification">התראה</option>
                    <option value="reassign">הקצאה מחדש</option>
                    <option value="escalate">אסקלציה למנהל</option>
                  </select>
                </div>
                <div>
                  <Label className="text-muted-foreground">הקצאה אוטומטית</Label>
                  <select value={escForm.auto_reassign ? "true" : "false"} onChange={e => setEscForm({ ...escForm, auto_reassign: e.target.value === "true" })} className="w-full bg-[#0f0f1a] border border-[#2a2a3e] text-white rounded-md px-3 py-2 text-sm">
                    <option value="false">לא</option>
                    <option value="true">כן</option>
                  </select>
                </div>
                {escForm.auto_reassign && (
                  <div className="col-span-2">
                    <Label className="text-muted-foreground">הקצה ל-</Label>
                    <select value={escForm.reassign_to || ""} onChange={e => setEscForm({ ...escForm, reassign_to: e.target.value })} className="w-full bg-[#0f0f1a] border border-[#2a2a3e] text-white rounded-md px-3 py-2 text-sm">
                      <option value="">בחר עובד</option>
                      {EMP.map(e => <option key={e} value={e}>{e}</option>)}
                    </select>
                  </div>
                )}
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <Button variant="outline" onClick={() => { setShowEscCreate(false); setEscForm({}); }}>ביטול</Button>
                <Button onClick={handleSaveEscalation} disabled={saving || !escForm.sla_id} className="bg-blue-600 hover:bg-blue-700 gap-2">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  צור כלל
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
