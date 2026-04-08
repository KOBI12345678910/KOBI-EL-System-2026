import { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus, Search, FileText, AlertTriangle, CheckCircle2, Clock, ArrowLeftRight,
  Calendar, DollarSign, Users, ChevronLeft, ChevronRight, RefreshCw, Eye,
  Edit2, Trash2, ArrowRight, MessageSquare, Shield, BarChart3, X, Save, Loader2
} from "lucide-react";
import { authFetch } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";

interface Contract {
  id: number;
  contract_number: string;
  title: string;
  description: string;
  contract_type: string;
  stage: string;
  priority: string;
  total_value: number;
  currency: string;
  start_date: string;
  end_date: string;
  signed_date: string;
  auto_renewal: boolean;
  renewal_period_months: number;
  renewal_notice_days: number;
  termination_notice_days: number;
  payment_terms: string;
  payment_frequency: string;
  owner_name: string;
  department: string;
  notes: string;
  tags: string;
  created_at: string;
  updated_at: string;
  obligations_count?: number;
  obligations_completed?: number;
  parties_count?: number;
  pending_redlines?: number;
  parties?: Party[];
  stages?: StageHistory[];
  obligations?: Obligation[];
  redlines?: Redline[];
}

interface Party {
  id: number;
  contract_id: number;
  party_type: string;
  party_name: string;
  contact_person: string;
  contact_email: string;
  contact_phone: string;
  role: string;
  notes: string;
}

interface StageHistory {
  id: number;
  from_stage: string;
  to_stage: string;
  changed_by_name: string;
  reason: string;
  created_at: string;
}

interface Obligation {
  id: number;
  contract_id: number;
  title: string;
  description: string;
  obligation_type: string;
  responsible_party: string;
  due_date: string;
  amount: number;
  currency: string;
  status: string;
  reminder_days_before: number;
  completed_at: string;
  contract_title?: string;
  contract_number?: string;
}

interface Redline {
  id: number;
  contract_id: number;
  clause_ref: string;
  original_text: string;
  proposed_text: string;
  proposed_by: string;
  proposed_at: string;
  status: string;
  response_text: string;
  responded_by: string;
  responded_at: string;
}

interface Stats {
  total: number;
  active: number;
  draft: number;
  in_progress: number;
  closed: number;
  expiring_soon: number;
  total_active_value: number;
  in_renewal: number;
  total_obligations: number;
  completed: number;
  due_soon: number;
  overdue: number;
}

const STAGE_COLORS: Record<string, string> = {
  "טיוטה": "bg-slate-500/20 text-slate-300 border-slate-500/30",
  "בדיקה": "bg-blue-500/20 text-blue-300 border-blue-500/30",
  "משא ומתן": "bg-amber-500/20 text-amber-300 border-amber-500/30",
  "אישור": "bg-purple-500/20 text-purple-300 border-purple-500/30",
  "חתימה": "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
  "פעיל": "bg-green-500/20 text-green-300 border-green-500/30",
  "חידוש": "bg-orange-500/20 text-orange-300 border-orange-500/30",
  "הסתיים": "bg-gray-500/20 text-gray-300 border-gray-500/30",
  "בוטל": "bg-red-500/20 text-red-300 border-red-500/30",
};

const STAGE_ORDER = ["טיוטה", "בדיקה", "משא ומתן", "אישור", "חתימה", "פעיל", "חידוש", "הסתיים", "בוטל"];
const CONTRACT_TYPES = ["ספק", "לקוח", "עובד", "קבלן", "שותפות", "NDA", "SLA", "אחר"];
const OBLIGATION_TYPES = ["תשלום", "אספקה", "ביצוע", "דיווח", "חידוש", "כללי"];

function formatCurrency(val: number | string, cur = "ILS"): string {
  const n = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(n)) return "₪0";
  return new Intl.NumberFormat("he-IL", { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(n);
}

function formatDate(d: string | null): string {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("he-IL");
}

function daysUntil(d: string | null): number | null {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
}

const emptyContract = {
  title: "", description: "", contract_type: "ספק", stage: "טיוטה", priority: "רגילה",
  total_value: 0, currency: "ILS", start_date: "", end_date: "", auto_renewal: false,
  renewal_period_months: 12, renewal_notice_days: 30, termination_notice_days: 30,
  payment_terms: "", payment_frequency: "חודשי", owner_name: "", department: "", notes: "", tags: "",
};

export default function ContractsDashboard() {
  const { toast } = useToast();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [pipeline, setPipeline] = useState<Record<string, Contract[]>>({});
  const [upcomingObligations, setUpcomingObligations] = useState<Obligation[]>([]);
  const [overdueObligations, setOverdueObligations] = useState<Obligation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("pipeline");
  const [showForm, setShowForm] = useState(false);
  const [editingContract, setEditingContract] = useState<Contract | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [detailContract, setDetailContract] = useState<Contract | null>(null);
  const [formData, setFormData] = useState(emptyContract);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [cRes, sRes, pRes, uRes, oRes] = await Promise.all([
        authFetch("/api/clm/contracts"),
        authFetch("/api/clm/contracts/stats"),
        authFetch("/api/clm/contracts/pipeline"),
        authFetch("/api/clm/obligations/upcoming"),
        authFetch("/api/clm/obligations/overdue"),
      ]);
      if (cRes.ok) setContracts(await cRes.json());
      if (sRes.ok) setStats(await sRes.json());
      if (pRes.ok) setPipeline(await pRes.json());
      if (uRes.ok) setUpcomingObligations(await uRes.json());
      if (oRes.ok) setOverdueObligations(await oRes.json());
    } catch {
      toast({ title: "שגיאה בטעינת נתונים", variant: "destructive" });
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const filtered = useMemo(() => {
    return contracts.filter(c => {
      if (typeFilter !== "all" && c.contract_type !== typeFilter) return false;
      if (stageFilter !== "all" && c.stage !== stageFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        return (c.title?.toLowerCase().includes(s) || c.contract_number?.toLowerCase().includes(s) ||
          c.owner_name?.toLowerCase().includes(s) || c.department?.toLowerCase().includes(s));
      }
      return true;
    });
  }, [contracts, search, typeFilter, stageFilter]);

  const openCreate = () => {
    setEditingContract(null);
    setFormData({ ...emptyContract });
    setShowForm(true);
  };

  const openEdit = (c: Contract) => {
    setEditingContract(c);
    setFormData({
      title: c.title || "", description: c.description || "", contract_type: c.contract_type || "ספק",
      stage: c.stage || "טיוטה", priority: c.priority || "רגילה",
      total_value: c.total_value || 0, currency: c.currency || "ILS",
      start_date: c.start_date || "", end_date: c.end_date || "",
      auto_renewal: c.auto_renewal || false, renewal_period_months: c.renewal_period_months || 12,
      renewal_notice_days: c.renewal_notice_days || 30, termination_notice_days: c.termination_notice_days || 30,
      payment_terms: c.payment_terms || "", payment_frequency: c.payment_frequency || "חודשי",
      owner_name: c.owner_name || "", department: c.department || "", notes: c.notes || "", tags: c.tags || "",
    });
    setShowForm(true);
  };

  const contractValidation = useFormValidation<typeof emptyContract>({
    title: { required: true, message: "כותרת החוזה חובה" },
    start_date: { required: true, message: "תאריך התחלה חובה" },
  });

  const saveContract = async () => {
    if (!contractValidation.validate(formData)) return;
    setSaving(true);
    try {
      const url = editingContract ? `/api/clm/contracts/${editingContract.id}` : "/api/clm/contracts";
      const method = editingContract ? "PUT" : "POST";
      const res = await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(formData) });
      if (res.ok) {
        setShowForm(false);
        contractValidation.clearErrors();
        loadData();
        toast({ title: editingContract ? "החוזה עודכן בהצלחה" : "החוזה נוצר בהצלחה" });
      } else {
        const err = await res.json().catch(() => ({ message: "שגיאה" }));
        toast({ title: err.message || "שגיאה בשמירת חוזה", variant: "destructive" });
      }
    } catch {
      toast({ title: "שגיאה בשמירת חוזה", variant: "destructive" });
    }
    setSaving(false);
  };

  const deleteContract = async (id: number) => {
    if (!confirm("למחוק חוזה זה?")) return;
    const res = await authFetch(`/api/clm/contracts/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast({ title: "החוזה נמחק" });
    } else {
      toast({ title: "שגיאה במחיקת חוזה", variant: "destructive" });
    }
    loadData();
  };

  const advanceStage = async (id: number, toStage: string) => {
    const res = await authFetch(`/api/clm/contracts/${id}/advance-stage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to_stage: toStage, changed_by_name: "מנהל" }),
    });
    if (res.ok) {
      toast({ title: `החוזה הועבר לשלב: ${toStage}` });
    } else {
      toast({ title: "שגיאה בהעברת שלב", variant: "destructive" });
    }
    loadData();
    if (detailContract && detailContract.id === id) openDetail(id);
  };

  const openDetail = async (id: number) => {
    const res = await authFetch(`/api/clm/contracts/${id}`);
    if (res.ok) {
      setDetailContract(await res.json());
      setShowDetail(true);
    }
  };

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">ניהול מחזור חיים חוזי — CLM</h1>
          <p className="text-sm text-muted-foreground mt-1">צפייה, ניהול ומעקב אחר כל החוזים הארגוניים</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadData}><RefreshCw className="w-4 h-4 ml-1" />רענון</Button>
          <Button size="sm" onClick={openCreate}><Plus className="w-4 h-4 ml-1" />חוזה חדש</Button>
        </div>
      </div>

      {stats && <StatsCards stats={stats} />}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-card/50 border border-border/50">
          <TabsTrigger value="pipeline">צינור חוזים</TabsTrigger>
          <TabsTrigger value="list">רשימת חוזים</TabsTrigger>
          <TabsTrigger value="obligations">התחייבויות</TabsTrigger>
          <TabsTrigger value="renewals">חידושים</TabsTrigger>
        </TabsList>

        <TabsContent value="pipeline" className="mt-4">
          <PipelineView pipeline={pipeline} onOpen={openDetail} onAdvance={advanceStage} />
        </TabsContent>

        <TabsContent value="list" className="mt-4">
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-4">
              <div className="flex flex-wrap gap-3 mb-4">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="חיפוש חוזה..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9 bg-background/50" />
                </div>
                <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
                  <option value="all">כל הסוגים</option>
                  {CONTRACT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <select value={stageFilter} onChange={e => setStageFilter(e.target.value)} className="bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
                  <option value="all">כל השלבים</option>
                  {STAGE_ORDER.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              {loading ? (
                <div className="text-center py-16 text-muted-foreground"><Loader2 className="w-8 h-8 mx-auto animate-spin mb-2" /><p>טוען...</p></div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p className="text-lg font-medium">אין חוזים להצגה</p>
                  <p className="text-sm mt-1">צור חוזה חדש כדי להתחיל</p>
                </div>
              ) : (
                <ContractTable contracts={filtered} onOpen={openDetail} onEdit={openEdit} onDelete={deleteContract} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="obligations" className="mt-4">
          <ObligationsView upcoming={upcomingObligations} overdue={overdueObligations} onRefresh={loadData} onOpenContract={openDetail} />
        </TabsContent>

        <TabsContent value="renewals" className="mt-4">
          <RenewalsView contracts={contracts} onOpen={openDetail} onAdvance={advanceStage} onRefresh={loadData} />
        </TabsContent>
      </Tabs>

      <ContractFormDialog open={showForm} onClose={() => { setShowForm(false); contractValidation.clearErrors(); }} formData={formData}
        setFormData={setFormData} onSave={saveContract} saving={saving} isEdit={!!editingContract}
        validationErrors={contractValidation.errors} />

      {detailContract && (
        <ContractDetailDialog open={showDetail} onClose={() => setShowDetail(false)}
          contract={detailContract} onAdvance={advanceStage} onRefresh={() => openDetail(detailContract.id)} />
      )}
    </div>
  );
}

function StatsCards({ stats }: { stats: Stats }) {
  const complianceRate = stats.total_obligations > 0
    ? Math.round((Number(stats.completed) / Number(stats.total_obligations)) * 100)
    : 0;

  const cards = [
    { label: "סה\"כ חוזים", value: stats.total, icon: FileText, color: "text-blue-400" },
    { label: "חוזים פעילים", value: stats.active, icon: CheckCircle2, color: "text-green-400" },
    { label: "שווי פעיל", value: formatCurrency(stats.total_active_value), icon: DollarSign, color: "text-emerald-400" },
    { label: "פגי תוקף בקרוב", value: stats.expiring_soon, icon: AlertTriangle, color: "text-orange-400" },
    { label: "התחייבויות באיחור", value: stats.overdue, icon: Clock, color: "text-red-400" },
    { label: "ציות התחייבויות", value: `${complianceRate}%`, icon: Shield, color: complianceRate >= 80 ? "text-green-400" : complianceRate >= 60 ? "text-amber-400" : "text-red-400" },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map(c => (
        <Card key={c.label} className="bg-card/50 border-border/50">
          <CardContent className="p-4 text-center">
            <c.icon className={`w-6 h-6 mx-auto mb-2 ${c.color}`} />
            <div className={`text-xl font-bold ${c.color}`}>{c.value}</div>
            <div className="text-xs text-muted-foreground mt-1">{c.label}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function PipelineView({ pipeline, onOpen, onAdvance }: {
  pipeline: Record<string, Contract[]>; onOpen: (id: number) => void; onAdvance: (id: number, stage: string) => void;
}) {
  const activeStages = STAGE_ORDER.filter(s => !["הסתיים", "בוטל"].includes(s));
  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {activeStages.map(stage => {
        const items = pipeline[stage] || [];
        return (
          <div key={stage} className="min-w-[260px] flex-shrink-0">
            <div className={`rounded-t-lg px-3 py-2 flex items-center justify-between border ${STAGE_COLORS[stage] || ""}`}>
              <span className="font-medium text-sm">{stage}</span>
              <Badge variant="outline" className="text-xs">{items.length}</Badge>
            </div>
            <div className="bg-card/30 border border-t-0 border-border/30 rounded-b-lg p-2 space-y-2 min-h-[200px]">
              {items.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">אין חוזים</p>
              ) : items.map(c => (
                <Card key={c.id} className="bg-card/60 border-border/40 cursor-pointer hover:border-primary/50 transition-colors" onClick={() => onOpen(c.id)}>
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-medium text-foreground line-clamp-1">{c.title}</p>
                        <p className="text-xs text-muted-foreground">{c.contract_number}</p>
                      </div>
                      <Badge variant="outline" className="text-[10px]">{c.contract_type}</Badge>
                    </div>
                    {c.total_value > 0 && <p className="text-xs text-emerald-400">{formatCurrency(c.total_value, c.currency)}</p>}
                    {c.end_date && (
                      <p className={`text-xs ${(daysUntil(c.end_date) ?? 999) <= 30 ? "text-orange-400" : "text-muted-foreground"}`}>
                        תוקף: {formatDate(c.end_date)}
                      </p>
                    )}
                    {stage !== "פעיל" && (
                      <div className="flex justify-end">
                        <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={e => {
                          e.stopPropagation();
                          const idx = STAGE_ORDER.indexOf(stage);
                          if (idx < STAGE_ORDER.length - 1) onAdvance(c.id, STAGE_ORDER[idx + 1]);
                        }}>
                          <ArrowRight className="w-3 h-3 ml-1" />קדם
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ContractTable({ contracts, onOpen, onEdit, onDelete }: {
  contracts: Contract[]; onOpen: (id: number) => void; onEdit: (c: Contract) => void; onDelete: (id: number) => void;
}) {
  const [page, setPage] = useState(1);
  const perPage = 15;
  const totalPages = Math.max(1, Math.ceil(contracts.length / perPage));
  const pageData = contracts.slice((page - 1) * perPage, page * perPage);

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/50">
              <th className="text-right p-3 text-muted-foreground font-medium">מס חוזה</th>
              <th className="text-right p-3 text-muted-foreground font-medium">כותרת</th>
              <th className="text-right p-3 text-muted-foreground font-medium">סוג</th>
              <th className="text-right p-3 text-muted-foreground font-medium">שלב</th>
              <th className="text-right p-3 text-muted-foreground font-medium">שווי</th>
              <th className="text-right p-3 text-muted-foreground font-medium">תוקף</th>
              <th className="text-right p-3 text-muted-foreground font-medium">אחראי</th>
              <th className="text-center p-3 text-muted-foreground font-medium w-28">פעולות</th>
            </tr>
          </thead>
          <tbody>
            {pageData.map(c => {
              const d = daysUntil(c.end_date);
              return (
                <tr key={c.id} className="border-b border-border/30 hover:bg-card/30 transition-colors">
                  <td className="p-3 text-blue-400 font-mono text-xs cursor-pointer" onClick={() => onOpen(c.id)}>{c.contract_number}</td>
                  <td className="p-3 text-foreground cursor-pointer" onClick={() => onOpen(c.id)}>{c.title}</td>
                  <td className="p-3"><Badge variant="outline" className="text-xs">{c.contract_type}</Badge></td>
                  <td className="p-3"><Badge className={`text-xs ${STAGE_COLORS[c.stage] || ""}`}>{c.stage}</Badge></td>
                  <td className="p-3 text-emerald-400">{c.total_value > 0 ? formatCurrency(c.total_value, c.currency) : "-"}</td>
                  <td className="p-3">
                    {c.end_date ? (
                      <span className={d !== null && d <= 30 ? (d < 0 ? "text-red-400" : "text-orange-400") : "text-foreground"}>
                        {formatDate(c.end_date)}
                        {d !== null && d <= 30 && d >= 0 && <span className="text-xs mr-1">({d} ימים)</span>}
                      </span>
                    ) : "-"}
                  </td>
                  <td className="p-3 text-foreground">{c.owner_name || "-"}</td>
                  <td className="p-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onOpen(c.id)}><Eye className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onEdit(c)}><Edit2 className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400" onClick={() => onDelete(c.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
          <span>מציג {(page - 1) * perPage + 1}-{Math.min(contracts.length, page * perPage)} מתוך {contracts.length}</span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronRight className="w-4 h-4" /></Button>
            <span className="px-3 py-1">{page}/{totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}><ChevronLeft className="w-4 h-4" /></Button>
          </div>
        </div>
      )}
    </>
  );
}

function ObligationsView({ upcoming, overdue, onRefresh, onOpenContract }: {
  upcoming: Obligation[]; overdue: Obligation[]; onRefresh: () => void; onOpenContract: (id: number) => void;
}) {
  const completeObligation = async (id: number) => {
    await authFetch(`/api/clm/obligations/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "הושלם", completed_by: "מנהל" }),
    });
    onRefresh();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card className="bg-card/50 border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <span className="text-red-400">התחייבויות באיחור ({overdue.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {overdue.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">אין התחייבויות באיחור</p>
          ) : overdue.map(o => (
            <div key={o.id} className="bg-red-500/5 border border-red-500/20 rounded-lg p-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{o.title}</p>
                  <p className="text-xs text-muted-foreground cursor-pointer hover:text-blue-400" onClick={() => onOpenContract(o.contract_id)}>
                    {o.contract_number} — {o.contract_title}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className="bg-red-500/20 text-red-300 text-xs">{formatDate(o.due_date)}</Badge>
                  <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => completeObligation(o.id)}>
                    <CheckCircle2 className="w-3 h-3 ml-1" />סיום
                  </Button>
                </div>
              </div>
              {o.amount > 0 && <p className="text-xs text-emerald-400 mt-1">{formatCurrency(o.amount)}</p>}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="bg-card/50 border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-400" />
            <span className="text-amber-400">התחייבויות קרובות ({upcoming.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">אין התחייבויות קרובות</p>
          ) : upcoming.map(o => (
            <div key={o.id} className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{o.title}</p>
                  <p className="text-xs text-muted-foreground cursor-pointer hover:text-blue-400" onClick={() => onOpenContract(o.contract_id)}>
                    {o.contract_number} — {o.contract_title}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className="bg-amber-500/20 text-amber-300 text-xs">
                    {daysUntil(o.due_date)} ימים
                  </Badge>
                  <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => completeObligation(o.id)}>
                    <CheckCircle2 className="w-3 h-3 ml-1" />סיום
                  </Button>
                </div>
              </div>
              {o.amount > 0 && <p className="text-xs text-emerald-400 mt-1">{formatCurrency(o.amount)}</p>}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function RenewalsView({ contracts, onOpen, onAdvance, onRefresh }: {
  contracts: Contract[]; onOpen: (id: number) => void; onAdvance: (id: number, stage: string) => void; onRefresh: () => void;
}) {
  const [interval, setInterval_] = useState(90);
  const [processing, setProcessing] = useState(false);

  const activeContracts = contracts.filter(c => {
    const d = daysUntil(c.end_date);
    return c.stage === "פעיל" && d !== null && d <= interval && d >= 0;
  });

  const expiredContracts = contracts.filter(c => {
    const d = daysUntil(c.end_date);
    return d !== null && d < 0 && !["הסתיים", "בוטל"].includes(c.stage);
  });

  const autoRenewing = activeContracts.filter(c => c.auto_renewal);
  const needsRenewal = activeContracts.filter(c => !c.auto_renewal);

  const triggerAutoRenewal = async () => {
    setProcessing(true);
    await authFetch("/api/clm/renewals/process-auto", { method: "POST" });
    setProcessing(false);
    onRefresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">טווח זמן:</span>
          <div className="flex gap-1">
            {[30, 60, 90].map(d => (
              <Button key={d} size="sm" variant={interval === d ? "default" : "outline"}
                className={interval === d ? "bg-orange-600" : ""} onClick={() => setInterval_(d)}>
                {d} יום
              </Button>
            ))}
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={triggerAutoRenewal} disabled={processing}>
          {processing ? <Loader2 className="w-3 h-3 ml-1 animate-spin" /> : <RefreshCw className="w-3 h-3 ml-1" />}
          הרץ חידוש אוטומטי
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <Card className="bg-orange-500/10 border-orange-500/30">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-orange-400">{activeContracts.length}</p>
            <p className="text-xs text-muted-foreground mt-1">פגי תוקף ב-{interval} ימים</p>
          </CardContent>
        </Card>
        <Card className="bg-green-500/10 border-green-500/30">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-green-400">{autoRenewing.length}</p>
            <p className="text-xs text-muted-foreground mt-1">חידוש אוטומטי</p>
          </CardContent>
        </Card>
        <Card className="bg-red-500/10 border-red-500/30">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-red-400">{expiredContracts.length}</p>
            <p className="text-xs text-muted-foreground mt-1">פגי תוקף (לא טופלו)</p>
          </CardContent>
        </Card>
      </div>

      {needsRenewal.length > 0 && (
        <Card className="bg-card/50 border-orange-500/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2 text-orange-400">
              <AlertTriangle className="w-4 h-4" />
              דורשים החלטה על חידוש ({needsRenewal.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {needsRenewal.map(c => {
              const d = daysUntil(c.end_date);
              return (
                <div key={c.id} className="bg-card/60 border border-border/40 rounded-lg p-4 flex items-center justify-between">
                  <div className="cursor-pointer" onClick={() => onOpen(c.id)}>
                    <p className="font-medium text-foreground">{c.title}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-muted-foreground">{c.contract_number}</span>
                      <Badge variant="outline" className="text-xs">{c.contract_type}</Badge>
                      {c.total_value > 0 && <span className="text-xs text-emerald-400">{formatCurrency(c.total_value)}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-left">
                      <p className={`text-sm font-medium ${d !== null && d <= 14 ? "text-red-400" : d !== null && d <= 30 ? "text-orange-400" : "text-amber-400"}`}>
                        {d} ימים
                      </p>
                      <p className="text-xs text-muted-foreground">{formatDate(c.end_date)}</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => onAdvance(c.id, "חידוש")}>
                      <RefreshCw className="w-3 h-3 ml-1" />התחל חידוש
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {autoRenewing.length > 0 && (
        <Card className="bg-card/50 border-green-500/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2 text-green-400">
              <CheckCircle2 className="w-4 h-4" />
              חידוש אוטומטי מתוכנן ({autoRenewing.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {autoRenewing.map(c => {
              const d = daysUntil(c.end_date);
              return (
                <div key={c.id} className="bg-card/60 border border-border/40 rounded-lg p-3 flex items-center justify-between">
                  <div className="cursor-pointer" onClick={() => onOpen(c.id)}>
                    <p className="text-sm font-medium text-foreground">{c.title}</p>
                    <p className="text-xs text-muted-foreground">{c.contract_number} · {c.renewal_period_months} חודשים</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-green-500/20 text-green-300 text-xs">אוטומטי ב-{d} ימים</Badge>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {expiredContracts.length > 0 && (
        <Card className="bg-card/50 border-red-500/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2 text-red-400">
              <AlertTriangle className="w-4 h-4" />
              פגי תוקף שלא טופלו ({expiredContracts.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {expiredContracts.map(c => (
              <div key={c.id} className="bg-red-500/5 border border-red-500/20 rounded-lg p-3 flex items-center justify-between">
                <div className="cursor-pointer" onClick={() => onOpen(c.id)}>
                  <p className="text-sm font-medium text-foreground">{c.title}</p>
                  <p className="text-xs text-muted-foreground">{c.contract_number} · פג: {formatDate(c.end_date)}</p>
                </div>
                <Button size="sm" variant="outline" className="border-red-500/30 text-red-400" onClick={() => onAdvance(c.id, "הסתיים")}>
                  סגור חוזה
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {activeContracts.length === 0 && expiredContracts.length === 0 && (
        <Card className="bg-card/50 border-border/50">
          <CardContent className="py-12 text-center text-muted-foreground">
            <RefreshCw className="w-8 h-8 mx-auto mb-3 opacity-50" />
            <p>אין חוזים שפגי תוקף ב-{interval} ימים הקרובים</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ContractFormDialog({ open, onClose, formData, setFormData, onSave, saving, isEdit, validationErrors }: {
  open: boolean; onClose: () => void; formData: typeof emptyContract;
  setFormData: (d: typeof emptyContract) => void; onSave: () => void; saving: boolean; isEdit: boolean;
  validationErrors?: Partial<Record<string, string>>;
}) {
  const update = (key: string, val: unknown) => setFormData({ ...formData, [key]: val });
  const getErr = (field: string) => validationErrors?.[field];
  const errCls = (field: string) => getErr(field) ? "border-red-500 focus:ring-red-500" : "";
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "עריכת חוזה" : "חוזה חדש"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 mt-4">
          <div className="col-span-2">
            <label className="text-sm text-muted-foreground">כותרת <RequiredMark /></label>
            <Input value={formData.title} onChange={e => update("title", e.target.value)} className={`bg-background/50 ${errCls("title")}`} />
            <FormFieldError error={getErr("title")} />
          </div>
          <div className="col-span-2">
            <label className="text-sm text-muted-foreground">תיאור</label>
            <textarea value={formData.description} onChange={e => update("description", e.target.value)}
              className="w-full bg-background/50 border border-border rounded-md p-2 text-sm text-foreground min-h-[60px]" />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">סוג חוזה</label>
            <select value={formData.contract_type} onChange={e => update("contract_type", e.target.value)}
              className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
              {CONTRACT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm text-muted-foreground">עדיפות</label>
            <select value={formData.priority} onChange={e => update("priority", e.target.value)}
              className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
              {["נמוכה", "רגילה", "גבוהה", "דחופה"].map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm text-muted-foreground">שווי חוזה</label>
            <Input type="number" value={formData.total_value} onChange={e => update("total_value", parseFloat(e.target.value) || 0)} className="bg-background/50" />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">מטבע</label>
            <select value={formData.currency} onChange={e => update("currency", e.target.value)}
              className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
              {["ILS", "USD", "EUR"].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm text-muted-foreground">תאריך התחלה <RequiredMark /></label>
            <Input type="date" value={formData.start_date} onChange={e => update("start_date", e.target.value)} className={`bg-background/50 ${errCls("start_date")}`} />
            <FormFieldError error={getErr("start_date")} />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">תאריך סיום</label>
            <Input type="date" value={formData.end_date} onChange={e => update("end_date", e.target.value)} className="bg-background/50" />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">תנאי תשלום</label>
            <Input value={formData.payment_terms} onChange={e => update("payment_terms", e.target.value)} className="bg-background/50" placeholder="שוטף + 30" />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">תדירות תשלום</label>
            <select value={formData.payment_frequency} onChange={e => update("payment_frequency", e.target.value)}
              className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
              {["חד פעמי", "חודשי", "רבעוני", "שנתי"].map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm text-muted-foreground">אחראי</label>
            <Input value={formData.owner_name} onChange={e => update("owner_name", e.target.value)} className="bg-background/50" />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">מחלקה</label>
            <Input value={formData.department} onChange={e => update("department", e.target.value)} className="bg-background/50" />
          </div>
          <div className="col-span-2 flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input type="checkbox" checked={formData.auto_renewal} onChange={e => update("auto_renewal", e.target.checked)} className="rounded" />
              חידוש אוטומטי
            </label>
            {formData.auto_renewal && (
              <div className="flex items-center gap-2">
                <Input type="number" value={formData.renewal_period_months} onChange={e => update("renewal_period_months", parseInt(e.target.value) || 12)}
                  className="bg-background/50 w-20" />
                <span className="text-xs text-muted-foreground">חודשים</span>
              </div>
            )}
          </div>
          <div>
            <label className="text-sm text-muted-foreground">ימי התראה לחידוש</label>
            <Input type="number" value={formData.renewal_notice_days} onChange={e => update("renewal_notice_days", parseInt(e.target.value) || 30)} className="bg-background/50" />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">ימי התראה לביטול</label>
            <Input type="number" value={formData.termination_notice_days} onChange={e => update("termination_notice_days", parseInt(e.target.value) || 30)} className="bg-background/50" />
          </div>
          <div className="col-span-2">
            <label className="text-sm text-muted-foreground">הערות</label>
            <textarea value={formData.notes} onChange={e => update("notes", e.target.value)}
              className="w-full bg-background/50 border border-border rounded-md p-2 text-sm text-foreground min-h-[50px]" />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onClose}>ביטול</Button>
          <Button onClick={onSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Save className="w-4 h-4 ml-1" />}
            {isEdit ? "עדכון" : "יצירה"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ContractDetailDialog({ open, onClose, contract, onAdvance, onRefresh }: {
  open: boolean; onClose: () => void; contract: Contract;
  onAdvance: (id: number, stage: string) => void; onRefresh: () => void;
}) {
  const [detailTab, setDetailTab] = useState("overview");
  const [obligationForm, setObligationForm] = useState(false);
  const [redlineForm, setRedlineForm] = useState(false);
  const [partyForm, setPartyForm] = useState(false);
  const [newObligation, setNewObligation] = useState({ title: "", obligation_type: "כללי", due_date: "", amount: 0, responsible_party: "", description: "" });
  const [newRedline, setNewRedline] = useState({ clause_ref: "", original_text: "", proposed_text: "", proposed_by: "" });
  const [newParty, setNewParty] = useState({ party_name: "", party_type: "ספק", contact_person: "", contact_email: "", contact_phone: "", role: "" });

  const currentIdx = STAGE_ORDER.indexOf(contract.stage);
  const canAdvance = currentIdx >= 0 && currentIdx < STAGE_ORDER.indexOf("פעיל");
  const nextStage = canAdvance ? STAGE_ORDER[currentIdx + 1] : null;

  const addObligation = async () => {
    await authFetch(`/api/clm/contracts/${contract.id}/obligations`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newObligation),
    });
    setObligationForm(false);
    setNewObligation({ title: "", obligation_type: "כללי", due_date: "", amount: 0, responsible_party: "", description: "" });
    onRefresh();
  };

  const addRedline = async () => {
    await authFetch(`/api/clm/contracts/${contract.id}/redlines`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newRedline),
    });
    setRedlineForm(false);
    setNewRedline({ clause_ref: "", original_text: "", proposed_text: "", proposed_by: "" });
    onRefresh();
  };

  const addParty = async () => {
    await authFetch(`/api/clm/contracts/${contract.id}/parties`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newParty),
    });
    setPartyForm(false);
    setNewParty({ party_name: "", party_type: "ספק", contact_person: "", contact_email: "", contact_phone: "", role: "" });
    onRefresh();
  };

  const respondRedline = async (id: number, status: string) => {
    await authFetch(`/api/clm/redlines/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, responded_by: "מנהל" }),
    });
    onRefresh();
  };

  const completeObligation = async (id: number) => {
    await authFetch(`/api/clm/obligations/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "הושלם", completed_by: "מנהל" }),
    });
    onRefresh();
  };

  const deleteObligation = async (id: number) => {
    await authFetch(`/api/clm/obligations/${id}`, { method: "DELETE" });
    onRefresh();
  };

  const deleteParty = async (id: number) => {
    await authFetch(`/api/clm/parties/${id}`, { method: "DELETE" });
    onRefresh();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span>{contract.title}</span>
            <Badge className={`${STAGE_COLORS[contract.stage] || ""}`}>{contract.stage}</Badge>
            <span className="text-sm font-normal text-muted-foreground">{contract.contract_number}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="mb-4">
          <div className="flex items-center gap-1 text-xs">
            {STAGE_ORDER.filter(s => !["הסתיים", "בוטל"].includes(s)).map((s, i) => {
              const active = STAGE_ORDER.indexOf(contract.stage) >= i;
              const current = contract.stage === s;
              return (
                <div key={s} className="flex items-center gap-1">
                  <div className={`px-2 py-1 rounded text-xs ${current ? "bg-primary text-primary-foreground font-bold" : active ? "bg-primary/20 text-primary" : "bg-muted/30 text-muted-foreground"}`}>
                    {s}
                  </div>
                  {i < 6 && <ChevronLeft className="w-3 h-3 text-muted-foreground" />}
                </div>
              );
            })}
          </div>
          {nextStage && (
            <Button size="sm" className="mt-2" onClick={() => onAdvance(contract.id, nextStage)}>
              <ArrowRight className="w-4 h-4 ml-1" />קדם ל{nextStage}
            </Button>
          )}
        </div>

        <Tabs value={detailTab} onValueChange={setDetailTab}>
          <TabsList className="bg-card/50 border border-border/50">
            <TabsTrigger value="overview">סקירה</TabsTrigger>
            <TabsTrigger value="parties">צדדים ({contract.parties?.length || 0})</TabsTrigger>
            <TabsTrigger value="obligations">התחייבויות ({contract.obligations?.length || 0})</TabsTrigger>
            <TabsTrigger value="redlines">שינויים ({contract.redlines?.length || 0})</TabsTrigger>
            <TabsTrigger value="timeline">ציר זמן</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <InfoField label="סוג" value={contract.contract_type} />
              <InfoField label="עדיפות" value={contract.priority} />
              <InfoField label="שווי" value={contract.total_value > 0 ? formatCurrency(contract.total_value, contract.currency) : "-"} />
              <InfoField label="תאריך התחלה" value={formatDate(contract.start_date)} />
              <InfoField label="תאריך סיום" value={formatDate(contract.end_date)} />
              <InfoField label="תאריך חתימה" value={formatDate(contract.signed_date)} />
              <InfoField label="תנאי תשלום" value={contract.payment_terms || "-"} />
              <InfoField label="תדירות" value={contract.payment_frequency || "-"} />
              <InfoField label="חידוש אוטומטי" value={contract.auto_renewal ? "כן" : "לא"} />
              <InfoField label="אחראי" value={contract.owner_name || "-"} />
              <InfoField label="מחלקה" value={contract.department || "-"} />
              <InfoField label="ימי התראה לסיום" value={`${contract.termination_notice_days || 30}`} />
            </div>
            {contract.description && (
              <div>
                <label className="text-xs text-muted-foreground">תיאור</label>
                <p className="text-sm text-foreground bg-card/30 rounded p-3 mt-1">{contract.description}</p>
              </div>
            )}
            {contract.notes && (
              <div>
                <label className="text-xs text-muted-foreground">הערות</label>
                <p className="text-sm text-foreground bg-card/30 rounded p-3 mt-1">{contract.notes}</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="parties" className="mt-4">
            <div className="flex justify-between mb-3">
              <h3 className="text-sm font-medium text-foreground">צדדים לחוזה</h3>
              <Button size="sm" variant="outline" onClick={() => setPartyForm(!partyForm)}>
                {partyForm ? <X className="w-3 h-3 ml-1" /> : <Plus className="w-3 h-3 ml-1" />}
                {partyForm ? "ביטול" : "הוסף צד"}
              </Button>
            </div>
            {partyForm && (
              <Card className="bg-card/30 border-border/40 mb-3">
                <CardContent className="p-3 grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground">שם *</label>
                    <Input value={newParty.party_name} onChange={e => setNewParty({ ...newParty, party_name: e.target.value })} className="bg-background/50" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">סוג</label>
                    <select value={newParty.party_type} onChange={e => setNewParty({ ...newParty, party_type: e.target.value })}
                      className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
                      {["ספק", "לקוח", "קבלן", "שותף", "אחר"].map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div><label className="text-xs text-muted-foreground">איש קשר</label><Input value={newParty.contact_person} onChange={e => setNewParty({ ...newParty, contact_person: e.target.value })} className="bg-background/50" /></div>
                  <div><label className="text-xs text-muted-foreground">אימייל</label><Input value={newParty.contact_email} onChange={e => setNewParty({ ...newParty, contact_email: e.target.value })} className="bg-background/50" /></div>
                  <div><label className="text-xs text-muted-foreground">טלפון</label><Input value={newParty.contact_phone} onChange={e => setNewParty({ ...newParty, contact_phone: e.target.value })} className="bg-background/50" /></div>
                  <div><label className="text-xs text-muted-foreground">תפקיד</label><Input value={newParty.role} onChange={e => setNewParty({ ...newParty, role: e.target.value })} className="bg-background/50" /></div>
                  <div className="col-span-2 flex justify-end">
                    <Button size="sm" onClick={addParty} disabled={!newParty.party_name}><Save className="w-3 h-3 ml-1" />שמור</Button>
                  </div>
                </CardContent>
              </Card>
            )}
            {(contract.parties?.length || 0) === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">אין צדדים</p>
            ) : contract.parties?.map(p => (
              <div key={p.id} className="bg-card/30 border border-border/30 rounded-lg p-3 mb-2 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-blue-400" />
                    <span className="text-sm font-medium text-foreground">{p.party_name}</span>
                    <Badge variant="outline" className="text-xs">{p.party_type}</Badge>
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                    {p.contact_person && <span>{p.contact_person}</span>}
                    {p.contact_email && <span>{p.contact_email}</span>}
                    {p.contact_phone && <span>{p.contact_phone}</span>}
                  </div>
                </div>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400" onClick={() => deleteParty(p.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="obligations" className="mt-4">
            <div className="flex justify-between mb-3">
              <h3 className="text-sm font-medium text-foreground">התחייבויות</h3>
              <Button size="sm" variant="outline" onClick={() => setObligationForm(!obligationForm)}>
                {obligationForm ? <X className="w-3 h-3 ml-1" /> : <Plus className="w-3 h-3 ml-1" />}
                {obligationForm ? "ביטול" : "הוסף התחייבות"}
              </Button>
            </div>
            {obligationForm && (
              <Card className="bg-card/30 border-border/40 mb-3">
                <CardContent className="p-3 grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="text-xs text-muted-foreground">כותרת *</label>
                    <Input value={newObligation.title} onChange={e => setNewObligation({ ...newObligation, title: e.target.value })} className="bg-background/50" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">סוג</label>
                    <select value={newObligation.obligation_type} onChange={e => setNewObligation({ ...newObligation, obligation_type: e.target.value })}
                      className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
                      {OBLIGATION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div><label className="text-xs text-muted-foreground">תאריך יעד</label><Input type="date" value={newObligation.due_date} onChange={e => setNewObligation({ ...newObligation, due_date: e.target.value })} className="bg-background/50" /></div>
                  <div><label className="text-xs text-muted-foreground">סכום</label><Input type="number" value={newObligation.amount} onChange={e => setNewObligation({ ...newObligation, amount: parseFloat(e.target.value) || 0 })} className="bg-background/50" /></div>
                  <div><label className="text-xs text-muted-foreground">אחראי</label><Input value={newObligation.responsible_party} onChange={e => setNewObligation({ ...newObligation, responsible_party: e.target.value })} className="bg-background/50" /></div>
                  <div className="col-span-2 flex justify-end">
                    <Button size="sm" onClick={addObligation} disabled={!newObligation.title}><Save className="w-3 h-3 ml-1" />שמור</Button>
                  </div>
                </CardContent>
              </Card>
            )}
            {(contract.obligations?.length || 0) === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">אין התחייבויות</p>
            ) : contract.obligations?.map(o => {
              const d = daysUntil(o.due_date);
              const isOverdue = o.status === "ממתין" && d !== null && d < 0;
              const isDueSoon = o.status === "ממתין" && d !== null && d >= 0 && d <= 7;
              return (
                <div key={o.id} className={`border rounded-lg p-3 mb-2 flex items-center justify-between ${
                  isOverdue ? "bg-red-500/5 border-red-500/20" : isDueSoon ? "bg-amber-500/5 border-amber-500/20" :
                  o.status === "הושלם" ? "bg-green-500/5 border-green-500/20" : "bg-card/30 border-border/30"
                }`}>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{o.title}</span>
                      <Badge variant="outline" className="text-xs">{o.obligation_type}</Badge>
                      <Badge className={`text-xs ${o.status === "הושלם" ? "bg-green-500/20 text-green-300" : isOverdue ? "bg-red-500/20 text-red-300" : "bg-amber-500/20 text-amber-300"}`}>{o.status}</Badge>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                      {o.due_date && <span>יעד: {formatDate(o.due_date)}</span>}
                      {o.amount > 0 && <span className="text-emerald-400">{formatCurrency(o.amount)}</span>}
                      {o.responsible_party && <span>אחראי: {o.responsible_party}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {o.status !== "הושלם" && (
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => completeObligation(o.id)}>
                        <CheckCircle2 className="w-3 h-3 ml-1" />סיום
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400" onClick={() => deleteObligation(o.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </TabsContent>

          <TabsContent value="redlines" className="mt-4">
            <div className="flex justify-between mb-3">
              <h3 className="text-sm font-medium text-foreground">שינויים ומשא ומתן</h3>
              <Button size="sm" variant="outline" onClick={() => setRedlineForm(!redlineForm)}>
                {redlineForm ? <X className="w-3 h-3 ml-1" /> : <Plus className="w-3 h-3 ml-1" />}
                {redlineForm ? "ביטול" : "הוסף שינוי"}
              </Button>
            </div>
            {redlineForm && (
              <Card className="bg-card/30 border-border/40 mb-3">
                <CardContent className="p-3 grid grid-cols-2 gap-3">
                  <div><label className="text-xs text-muted-foreground">סעיף</label><Input value={newRedline.clause_ref} onChange={e => setNewRedline({ ...newRedline, clause_ref: e.target.value })} className="bg-background/50" placeholder="סעיף 3.1" /></div>
                  <div><label className="text-xs text-muted-foreground">מוצע ע&quot;י</label><Input value={newRedline.proposed_by} onChange={e => setNewRedline({ ...newRedline, proposed_by: e.target.value })} className="bg-background/50" /></div>
                  <div className="col-span-2">
                    <label className="text-xs text-muted-foreground">נוסח מקורי</label>
                    <textarea value={newRedline.original_text} onChange={e => setNewRedline({ ...newRedline, original_text: e.target.value })}
                      className="w-full bg-background/50 border border-border rounded-md p-2 text-sm text-foreground min-h-[50px]" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-muted-foreground">נוסח מוצע *</label>
                    <textarea value={newRedline.proposed_text} onChange={e => setNewRedline({ ...newRedline, proposed_text: e.target.value })}
                      className="w-full bg-background/50 border border-border rounded-md p-2 text-sm text-foreground min-h-[50px]" />
                  </div>
                  <div className="col-span-2 flex justify-end">
                    <Button size="sm" onClick={addRedline} disabled={!newRedline.proposed_text || !newRedline.proposed_by}><Save className="w-3 h-3 ml-1" />שמור</Button>
                  </div>
                </CardContent>
              </Card>
            )}
            {(contract.redlines?.length || 0) === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">אין שינויים</p>
            ) : contract.redlines?.map(r => (
              <div key={r.id} className={`border rounded-lg p-3 mb-2 ${
                r.status === "אושר" ? "bg-green-500/5 border-green-500/20" :
                r.status === "נדחה" ? "bg-red-500/5 border-red-500/20" :
                "bg-amber-500/5 border-amber-500/20"
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-amber-400" />
                    {r.clause_ref && <span className="text-xs font-medium text-blue-400">{r.clause_ref}</span>}
                    <span className="text-xs text-muted-foreground">הוצע ע"י {r.proposed_by}</span>
                    <Badge className={`text-xs ${r.status === "אושר" ? "bg-green-500/20 text-green-300" : r.status === "נדחה" ? "bg-red-500/20 text-red-300" : "bg-amber-500/20 text-amber-300"}`}>{r.status}</Badge>
                  </div>
                  {r.status === "ממתין" && (
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" className="h-6 text-xs text-green-400" onClick={() => respondRedline(r.id, "אושר")}>
                        <CheckCircle2 className="w-3 h-3 ml-1" />אשר
                      </Button>
                      <Button variant="ghost" size="sm" className="h-6 text-xs text-red-400" onClick={() => respondRedline(r.id, "נדחה")}>
                        <X className="w-3 h-3 ml-1" />דחה
                      </Button>
                    </div>
                  )}
                </div>
                {r.original_text && (
                  <div className="bg-red-500/5 rounded p-2 mb-1 text-sm text-red-300 line-through">{r.original_text}</div>
                )}
                <div className="bg-green-500/5 rounded p-2 text-sm text-green-300">{r.proposed_text}</div>
                {r.responded_by && (
                  <p className="text-xs text-muted-foreground mt-2">
                    {r.status === "אושר" ? "אושר" : "נדחה"} ע"י {r.responded_by} ב-{formatDate(r.responded_at)}
                  </p>
                )}
              </div>
            ))}
          </TabsContent>

          <TabsContent value="timeline" className="mt-4">
            <h3 className="text-sm font-medium text-foreground mb-3">ציר זמן — שינויי שלבים</h3>
            {(contract.stages?.length || 0) === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">אין היסטוריה</p>
            ) : (
              <div className="relative pr-4">
                <div className="absolute right-1 top-0 bottom-0 w-0.5 bg-border/50" />
                {contract.stages?.map((s, i) => (
                  <div key={s.id} className="relative mb-4 pr-6">
                    <div className="absolute right-0 top-1 w-3 h-3 rounded-full bg-primary border-2 border-background" />
                    <div className="bg-card/30 border border-border/30 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1">
                        {s.from_stage && <Badge className={`text-xs ${STAGE_COLORS[s.from_stage] || ""}`}>{s.from_stage}</Badge>}
                        {s.from_stage && <ArrowRight className="w-3 h-3 text-muted-foreground" />}
                        <Badge className={`text-xs ${STAGE_COLORS[s.to_stage] || ""}`}>{s.to_stage}</Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{s.changed_by_name}</span>
                        <span>{new Date(s.created_at).toLocaleString("he-IL")}</span>
                      </div>
                      {s.reason && <p className="text-xs text-foreground mt-1">{s.reason}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground">{label}</label>
      <p className="text-sm text-foreground mt-0.5">{value}</p>
    </div>
  );
}
