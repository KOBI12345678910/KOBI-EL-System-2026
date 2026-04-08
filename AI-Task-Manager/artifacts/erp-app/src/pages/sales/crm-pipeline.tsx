import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ExportDropdown from "@/components/export-dropdown";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { Badge } from "@/components/ui/badge";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import { authFetch } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import RelatedRecords from "@/components/related-records";
import {
  Target, Search, Plus, Edit2, Trash2, X, Save, Eye, ArrowUpDown, AlertTriangle,
  DollarSign, TrendingUp, Award, Clock, LayoutList, Columns3, ChevronDown
} from "lucide-react";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (n: any) => Number(n || 0).toLocaleString("he-IL");
const fmtC = (n: any) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(Number(n || 0));

const STAGES: { key: string; label: string; color: string; bg: string }[] = [
  { key: "lead", label: "ליד", color: "text-muted-foreground", bg: "bg-muted/10 border-gray-500/30" },
  { key: "qualified", label: "מוסמך", color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/30" },
  { key: "proposal", label: "הצעה", color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/30" },
  { key: "negotiation", label: "מו\"מ", color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/30" },
  { key: "won", label: "נסגר", color: "text-green-400", bg: "bg-green-500/10 border-green-500/30" },
  { key: "lost", label: "אבוד", color: "text-red-400", bg: "bg-red-500/10 border-red-500/30" },
];
const STAGE_MAP = Object.fromEntries(STAGES.map(s => [s.key, s]));
const SOURCES = ["אתר", "טלפון", "הפניה", "פייסבוק", "גוגל", "תערוכה", "סוכן", "אחר"];

function DetailField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return <div><div className="text-xs text-muted-foreground mb-1">{label}</div>{children || <div className="text-sm text-foreground font-medium">{value || "—"}</div>}</div>;
}

export default function CrmPipeline() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStage, setFilterStage] = useState("all");
  const [sortField, setSortField] = useState("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [viewDetail, setViewDetail] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [detailTab, setDetailTab] = useState("details");
  const pagination = useSmartPagination(25);
  const { selectedIds, setSelectedIds, toggle, toggleAll, clear, isSelected } = useBulkSelection();

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const [iRes, sRes] = await Promise.all([
        authFetch(`${API}/sales/opportunities`),
        authFetch(`${API}/sales/opportunities/stats`).catch(() => null),
      ]);
      if (iRes.ok) setItems(safeArray(await iRes.json()));
      else throw new Error("שגיאה בטעינת הזדמנויות");
      if (sRes?.ok) setStats(await sRes.json());
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggleSort = (f: string) => { if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField(f); setSortDir("asc"); } };

  const filtered = useMemo(() => {
    let data = items.filter(i =>
      (filterStage === "all" || i.stage === filterStage) &&
      (!search || [i.name, i.customer_name, i.opportunity_number, i.contact_name].some(f => f?.toLowerCase().includes(search.toLowerCase())))
    );
    data.sort((a: any, b: any) => {
      const va = a[sortField] ?? ""; const vb = b[sortField] ?? "";
      const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    pagination.setTotalItems(data.length);
    return data;
  }, [items, search, filterStage, sortField, sortDir]);

  const openCreate = () => { setEditing(null); setForm({ stage: "lead", probability: 0, value: 0 }); setShowForm(true); };
  const openEdit = (r: any) => { setEditing(r); setForm({ name: r.name, customerName: r.customer_name, contactName: r.contact_name, email: r.email, phone: r.phone, stage: r.stage, value: r.value, probability: r.probability, expectedCloseDate: r.expected_close_date?.slice(0, 10), assignedRep: r.assigned_rep, source: r.source, notes: r.notes }); setShowForm(true); };
  const save = async () => {
    if (!form.name) { alert("שדה חובה: שם הזדמנות"); return; }
    if (!form.customerName) { alert("שדה חובה: שם לקוח"); return; }
    setSaving(true);
    try {
      const url = editing ? `${API}/sales/opportunities/${editing.id}` : `${API}/sales/opportunities`;
      const res = await authFetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert("שגיאה בשמירה: " + (e.error || e.message || "שגיאה")); setSaving(false); return; }
      setShowForm(false); load();
    } catch (e: any) { alert("שגיאה בשמירה: " + (e.message || "שגיאת רשת")); }
    setSaving(false);
  };
  const [winLossPrompt, setWinLossPrompt] = useState<{ id: number; oppName: string; oppValue: number; assignedRep: string; stage: string } | null>(null);
  const [winLossForm, setWinLossForm] = useState<any>({});

  const moveStage = async (id: number, stage: string) => {
    await authFetch(`${API}/sales/opportunities/${id}/stage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stage }) });
    // Prompt for win/loss reason when closing
    if (stage === "won" || stage === "lost") {
      const opp = items.find(r => r.id === id);
      if (opp) {
        setWinLossForm({ outcome: stage, reasonCategory: "", reason: "", competitor: "" });
        setWinLossPrompt({ id, oppName: opp.name, oppValue: opp.value, assignedRep: opp.assigned_rep, stage });
        return;
      }
    }
    load();
  };

  const saveWinLossReason = async () => {
    if (!winLossPrompt) return;
    if (winLossForm.reason || winLossForm.reasonCategory) {
      await authFetch(`${API}/sales/win-loss-reasons`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opportunityId: winLossPrompt.id, opportunityName: winLossPrompt.oppName,
          outcome: winLossPrompt.stage, reason: winLossForm.reason,
          reasonCategory: winLossForm.reasonCategory, competitor: winLossForm.competitor,
          dealValue: winLossPrompt.oppValue, repName: winLossPrompt.assignedRep,
        })
      });
    }
    setWinLossPrompt(null);
    load();
  };
  const remove = async (id: number) => {
    if (await globalConfirm("למחוק הזדמנות?")) {
      await authFetch(`${API}/sales/opportunities/${id}`, { method: "DELETE" }); load();
    }
  };

  const kpis = [
    { label: "סה\"כ הזדמנויות", value: fmt(stats.total || items.length), icon: Target, color: "text-blue-400" },
    { label: "ערך צנרת", value: fmtC(stats.pipeline_value || items.reduce((s: number, i: any) => s + Number(i.value || 0), 0)), icon: DollarSign, color: "text-cyan-400" },
    { label: "שיעור זכייה", value: `${stats.win_rate || 0}%`, icon: Award, color: "text-green-400" },
    { label: "נסגרים בקרוב", value: fmt(stats.closing_soon || 0), icon: Clock, color: "text-amber-400" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2"><Target className="text-blue-400 w-6 h-6" /> צנרת CRM</h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול הזדמנויות מכירה ומעקב שלבים</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setViewMode(viewMode === "kanban" ? "list" : "kanban")} className="flex items-center gap-1.5 bg-card border border-border text-muted-foreground px-3 py-2 rounded-xl text-sm hover:bg-muted">
            {viewMode === "kanban" ? <LayoutList className="w-4 h-4" /> : <Columns3 className="w-4 h-4" />}
            {viewMode === "kanban" ? "רשימה" : "קנבן"}
          </button>
          <ExportDropdown data={filtered} headers={{ opportunity_number: "מספר", name: "שם", customer_name: "לקוח", stage: "שלב", value: "ערך", probability: "הסתברות" }} filename="crm_pipeline" />
          <button onClick={openCreate} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium"><Plus className="w-4 h-4" /> הזדמנות חדשה</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map((kpi, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="bg-card border border-border/50 rounded-2xl p-4">
            <kpi.icon className={`${kpi.color} w-5 h-5 mb-2`} /><div className="text-xl font-bold text-foreground">{kpi.value}</div><div className="text-xs text-muted-foreground">{kpi.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-0 sm:min-w-[200px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש הזדמנות..." className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
        <select value={filterStage} onChange={e => setFilterStage(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל השלבים</option>{STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <span className="text-sm text-muted-foreground">{filtered.length} תוצאות</span>
      </div>

      {loading ? (
        <div className="space-y-4"><div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">{Array.from({length:6}).map((_,i)=><div key={i} className="bg-card border border-border/50 rounded-2xl p-4 animate-pulse"><div className="h-5 w-5 bg-muted/30 rounded mb-2" /><div className="h-6 w-20 bg-muted/30 rounded mb-1" /><div className="h-3 w-16 bg-muted/30 rounded" /></div>)}</div><div className="h-10 bg-muted/20 rounded-xl animate-pulse" /><div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><table className="w-full"><tbody>{Array.from({length:8}).map((_,i)=><tr key={i} className="border-b border-border/20"><td className="p-3" colSpan={99}><div className="flex items-center gap-4 animate-pulse"><div className="h-4 w-4 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-32 bg-muted/30 rounded" /><div className="h-4 w-24 bg-muted/30 rounded" /><div className="h-4 w-20 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-28 bg-muted/30 rounded" /></div></td></tr>)}</tbody></table></div></div>
      ) : error ? (
        <div className="text-center py-16 text-red-400"><AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" /><p className="font-medium">{error}</p><button onClick={load} className="mt-4 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm">נסה שנית</button></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground"><Target className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="font-medium">אין הזדמנויות</p><p className="text-sm mt-1">{search ? "נסה לשנות את הסינון" : "לחץ על 'הזדמנות חדשה' להתחלה"}</p>{!(search) && <button onClick={() => openCreate()} className="mt-4 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 text-sm font-medium flex items-center gap-2 mx-auto"><Plus className="w-4 h-4" />הזדמנות חדשה</button>}</div>
      ) : viewMode === "kanban" ? (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {STAGES.map(stage => {
            const stageItems = filtered.filter(r => r.stage === stage.key);
            const stageValue = stageItems.reduce((s: number, r: any) => s + Number(r.value || 0), 0);
            const stageWeighted = stageItems.reduce((s: number, r: any) => s + (Number(r.value || 0) * Number(r.probability || 0) / 100), 0);
            return (
              <div key={stage.key} className={`flex-shrink-0 w-64 border rounded-2xl ${stage.bg}`}>
                <div className="p-3 border-b border-border/20">
                  <div className="flex justify-between items-center"><span className={`font-bold text-sm ${stage.color}`}>{stage.label}</span><Badge className={`text-[10px] ${stage.bg} ${stage.color}`}>{stageItems.length}</Badge></div>
                  <div className="text-xs text-foreground/80 mt-1 font-medium">{fmtC(stageValue)}</div>
                  {!["won","lost"].includes(stage.key) && <div className="text-[10px] text-muted-foreground mt-0.5">משוקלל: {fmtC(stageWeighted)}</div>}
                </div>
                <div className="p-2 space-y-2 min-h-[100px] max-h-[60vh] overflow-y-auto">
                  {stageItems.map(r => {
                    const weighted = Number(r.value || 0) * Number(r.probability || 0) / 100;
                    return (
                      <div key={r.id} className="bg-card border border-border/50 rounded-xl p-3 cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setViewDetail(r)}>
                        <div className="font-medium text-sm text-foreground truncate">{r.name}</div>
                        <div className="text-xs text-muted-foreground truncate">{r.customer_name}</div>
                        <div className="flex justify-between items-center mt-2">
                          <div>
                            <span className="text-xs font-bold text-foreground">{fmtC(r.value || 0)}</span>
                            {!["won","lost"].includes(r.stage) && <div className="text-[10px] text-muted-foreground">משוקלל: {fmtC(weighted)}</div>}
                          </div>
                          <Badge className="text-[10px] bg-muted/50 text-muted-foreground">{r.probability || 0}%</Badge>
                        </div>
                        {r.expected_close_date && <div className="text-xs text-muted-foreground mt-1">סגירה: {r.expected_close_date.slice(0, 10)}</div>}
                        <div className="flex gap-1 mt-2 flex-wrap">
                          {STAGES.filter(s => s.key !== stage.key && s.key !== "lost").slice(0, 3).map(s => (
                            <button key={s.key} onClick={e => { e.stopPropagation(); moveStage(r.id, s.key); }} className={`text-[10px] px-1.5 py-0.5 rounded border ${s.bg} ${s.color} hover:opacity-80`}>{s.label}</button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {stageItems.length === 0 && <div className="text-center py-6 text-xs text-muted-foreground">אין הזדמנויות</div>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (<>
        <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b border-border/50"><tr>
              {[{ key: "opportunity_number", label: "מספר" }, { key: "name", label: "שם" }, { key: "customer_name", label: "לקוח" }, { key: "stage", label: "שלב" }, { key: "value", label: "ערך" }, { key: "probability", label: "סבירות" }, { key: "weighted_value", label: "משוקלל" }, { key: "expected_close_date", label: "סגירה צפויה" }].map(col => (
                <th key={col.key} onClick={() => col.key !== "weighted_value" && toggleSort(col.key)} className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground"><div className="flex items-center gap-1">{col.label}{col.key !== "weighted_value" && <ArrowUpDown className="w-3 h-3" />}</div></th>
              ))}
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
            </tr></thead>
            <tbody>{pagination.paginate(filtered).map(r => {
              const stageInfo = STAGE_MAP[r.stage] || STAGES[0];
              const weighted = Number(r.value || 0) * Number(r.probability || 0) / 100;
              return (
              <tr key={r.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{r.opportunity_number || "—"}</td>
                <td className="px-4 py-3 text-foreground font-medium">{r.name || "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.customer_name || "—"}</td>
                <td className="px-4 py-3"><Badge className={`text-[10px] ${stageInfo.bg} ${stageInfo.color}`}>{stageInfo.label}</Badge></td>
                <td className="px-4 py-3 text-foreground font-bold">{fmtC(r.value || 0)}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.probability || 0}%</td>
                <td className="px-4 py-3 text-blue-400 font-medium">{fmtC(weighted)}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{r.expected_close_date?.slice(0, 10) || "—"}</td>
                <td className="px-4 py-3"><div className="flex gap-1">
                  <button onClick={() => setViewDetail(r)} className="p-1.5 hover:bg-muted rounded-lg"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                  <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
                  {isSuperAdmin && <button onClick={async()=>{if(await globalConfirm(`למחוק את '${r.name || r.id}'? פעולה זו אינה ניתנת לביטול.`))remove(r.id)}} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>}
                </div></td>
              </tr>);
            })}</tbody>
          </table>
        </div></div>
        <SmartPagination pagination={pagination} />
      </>)}

      <AnimatePresence>{viewDetail && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setViewDetail(null)}>
          <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-border flex justify-between items-center"><h2 className="text-lg font-bold text-foreground flex items-center gap-2"><Target className="w-5 h-5 text-blue-400" />{viewDetail.name}</h2><button onClick={() => setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button></div>
            <div className="p-5 grid grid-cols-2 gap-4">
              <DetailField label="מספר הזדמנות" value={viewDetail.opportunity_number} />
              <DetailField label="לקוח" value={viewDetail.customer_name} />
              <DetailField label="איש קשר" value={viewDetail.contact_name} />
              <DetailField label="אימייל" value={viewDetail.email} />
              <DetailField label="שלב"><Badge className={`${STAGE_MAP[viewDetail.stage]?.bg} ${STAGE_MAP[viewDetail.stage]?.color}`}>{STAGE_MAP[viewDetail.stage]?.label}</Badge></DetailField>
              <DetailField label="ערך" value={fmtC(viewDetail.value || 0)} />
              <DetailField label="הסתברות" value={`${viewDetail.probability || 0}%`} />
              <DetailField label="סגירה צפויה" value={viewDetail.expected_close_date?.slice(0, 10)} />
              <DetailField label="נציג" value={viewDetail.assigned_rep} />
              <DetailField label="מקור" value={viewDetail.source} />
              <div className="col-span-2"><DetailField label="הערות" value={viewDetail.notes} /></div>
            </div>
            <div className="p-5 border-t border-border flex justify-between">
              <div className="flex gap-1 flex-wrap">{STAGES.filter(s => s.key !== viewDetail.stage).map(s => (
                <button key={s.key} onClick={() => { moveStage(viewDetail.id, s.key); setViewDetail(null); }} className={`text-xs px-2 py-1 rounded-lg border ${s.bg} ${s.color} hover:opacity-80`}>{s.label}</button>
              ))}</div>
              <div className="flex gap-2">
                <button onClick={() => { setViewDetail(null); openEdit(viewDetail); }} className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg text-sm"><Edit2 className="w-3.5 h-3.5 inline ml-1" /> עריכה</button>
                <button onClick={() => setViewDetail(null)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">סגור</button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}</AnimatePresence>

      <AnimatePresence>{showForm && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-border flex justify-between items-center"><h2 className="text-lg font-bold text-foreground">{editing ? "עריכת הזדמנות" : "הזדמנות חדשה"}</h2><button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button></div>
            <div className="p-5 grid grid-cols-2 gap-4">
              <div className="col-span-2"><label className="block text-sm font-medium text-muted-foreground mb-1.5">שם ההזדמנות *</label><input value={form.name || ""} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">לקוח</label><input value={form.customerName || ""} onChange={e => setForm({ ...form, customerName: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">איש קשר</label><input value={form.contactName || ""} onChange={e => setForm({ ...form, contactName: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">אימייל</label><input value={form.email || ""} onChange={e => setForm({ ...form, email: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">טלפון</label><input value={form.phone || ""} onChange={e => setForm({ ...form, phone: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">שלב</label><select value={form.stage || "lead"} onChange={e => setForm({ ...form, stage: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}</select></div>
              <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">ערך (₪)</label><input type="number" value={form.value || 0} onChange={e => setForm({ ...form, value: Number(e.target.value) })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">הסתברות %</label><input type="number" value={form.probability || 0} onChange={e => setForm({ ...form, probability: Number(e.target.value) })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">סגירה צפויה</label><input type="date" value={form.expectedCloseDate || ""} onChange={e => setForm({ ...form, expectedCloseDate: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">נציג אחראי</label><input value={form.assignedRep || ""} onChange={e => setForm({ ...form, assignedRep: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">מקור</label><select value={form.source || ""} onChange={e => setForm({ ...form, source: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm"><option value="">בחר מקור</option>{SOURCES.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
              <div className="col-span-2"><label className="block text-sm font-medium text-muted-foreground mb-1.5">הערות</label><textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
            </div>
            <div className="p-5 border-t border-border flex justify-end gap-2">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">ביטול</button>
              <button onClick={save} disabled={saving} className="px-6 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90 disabled:opacity-50"><Save className="w-3.5 h-3.5 inline ml-1" /> {editing ? "עדכון" : "שמירה"}</button>
            </div>
          </motion.div>
        </motion.div>
      )}</AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <ActivityLog entityType="pipeline" entityId="all" />
        <RelatedRecords entityType="pipeline" entityId="all" />
      </div>

      {/* Win/Loss Reason Modal */}
      <AnimatePresence>
        {winLossPrompt && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl w-full max-w-md shadow-xl">
              <div className="p-5 border-b border-border">
                <h3 className="font-bold text-lg flex items-center gap-2">
                  {winLossPrompt.stage === "won" ? <span className="text-green-400">✓ זכינו!</span> : <span className="text-red-400">✗ הפסדנו</span>}
                  &nbsp;— תיעוד סיבה
                </h3>
                <p className="text-sm text-muted-foreground mt-1">{winLossPrompt.oppName} &bull; {Number(winLossPrompt.oppValue || 0).toLocaleString("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 })}</p>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">קטגוריית סיבה</label>
                  <select value={winLossForm.reasonCategory || ""} onChange={e => setWinLossForm({ ...winLossForm, reasonCategory: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                    <option value="">בחר קטגוריה</option>
                    {winLossPrompt.stage === "won" ? (
                      <>
                        <option value="price">מחיר תחרותי</option>
                        <option value="relationship">קשר אישי</option>
                        <option value="product">יתרון מוצרי</option>
                        <option value="service">שירות מעולה</option>
                        <option value="referral">המלצה</option>
                      </>
                    ) : (
                      <>
                        <option value="price">מחיר גבוה</option>
                        <option value="competition">מתחרה</option>
                        <option value="timing">עיתוי לא מתאים</option>
                        <option value="budget">חריגת תקציב</option>
                        <option value="no_need">אין צורך</option>
                        <option value="product_fit">חוסר התאמה</option>
                      </>
                    )}
                    <option value="other">אחר</option>
                  </select>
                </div>
                {winLossPrompt.stage === "lost" && (
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">מתחרה שזכה (אם ידוע)</label>
                    <input value={winLossForm.competitor || ""} onChange={e => setWinLossForm({ ...winLossForm, competitor: e.target.value })} placeholder="שם המתחרה" className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">הערות נוספות</label>
                  <textarea value={winLossForm.reason || ""} onChange={e => setWinLossForm({ ...winLossForm, reason: e.target.value })} rows={3} placeholder="פרט בקצרה..." className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => { setWinLossPrompt(null); load(); }} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">דלג</button>
                <button onClick={saveWinLossReason} className={`px-6 py-2 rounded-lg text-sm ${winLossPrompt.stage === "won" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"} text-foreground`}>
                  <Save className="w-3.5 h-3.5 inline ml-1" /> שמור סיבה
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}