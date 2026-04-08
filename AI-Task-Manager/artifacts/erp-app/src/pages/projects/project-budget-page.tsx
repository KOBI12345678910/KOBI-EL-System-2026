import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  DollarSign, Search, Plus, Edit2, Trash2, X, Save, Eye,
  ArrowUpDown, AlertTriangle, TrendingUp, Wallet, PiggyBank, BarChart3,
  Activity, Camera, TrendingDown, CheckCircle2, Copy
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import ExportDropdown from "@/components/export-dropdown";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { Badge } from "@/components/ui/badge";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import { authFetch } from "@/lib/utils";
import { duplicateRecord } from "@/lib/duplicate-record";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import AttachmentsSection from "@/components/attachments-section";
import { useFormValidation, FormFieldError } from "@/hooks/use-form-validation";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");
const fmtN = (v: any, dec = 2) => v !== null && v !== undefined ? parseFloat(v).toFixed(dec) : "—";

function DetailField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      {children || <div className="text-sm text-foreground font-medium">{value || "—"}</div>}
    </div>
  );
}

function EvmBadge({ value, good = "above" }: { value: number | null; good?: "above" | "below" }) {
  if (value === null || value === undefined) return <span className="text-muted-foreground">—</span>;
  const isGood = good === "above" ? value >= 1 : value <= 1;
  return (
    <span className={`font-bold ${isGood ? "text-green-400" : "text-red-400"}`}>
      {value.toFixed(3)}
    </span>
  );
}

type Tab = "lines" | "evm" | "history";

export default function ProjectBudgetPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [evmData, setEvmData] = useState<any>(null);
  const [evmHistory, setEvmHistory] = useState<any[]>([]);
  const [evmLoading, setEvmLoading] = useState(false);
  const [snapshotting, setSnapshotting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [viewDetail, setViewDetail] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const pagination = useSmartPagination(25);
  const [detailTab, setDetailTab] = useState("details");
  const [activeTab, setActiveTab] = useState<Tab>("lines");
  const { selectedIds, toggle, clear, isSelected } = useBulkSelection();
  const { errors, validate } = useFormValidation<any>({
    category: { required: true, minLength: 2, message: "קטגוריה חובה" },
  });

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`${API}/project-budget-lines`);
      if (res.ok) setItems(safeArray(await res.json()));
      else throw new Error("שגיאה בטעינת נתונים");
    } catch (e: any) { setError(e.message || "שגיאה בטעינת נתונים"); }
    setLoading(false);
  };

  const loadEvm = async (projectId: number) => {
    setEvmLoading(true);
    try {
      const [evmRes, histRes] = await Promise.all([
        authFetch(`${API}/project-evm/${projectId}`),
        authFetch(`${API}/project-evm/${projectId}/history`),
      ]);
      if (evmRes.ok) setEvmData(await evmRes.json());
      if (histRes.ok) setEvmHistory(safeArray(await histRes.json()));
    } catch {}
    setEvmLoading(false);
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (selectedProjectId) loadEvm(selectedProjectId);
    else { setEvmData(null); setEvmHistory([]); }
  }, [selectedProjectId]);

  const filtered = useMemo(() => {
    let data = items.filter(i =>
      (!search || [i.category, i.notes]
        .some(f => f?.toLowerCase().includes(search.toLowerCase())))
    );
    data.sort((a: any, b: any) => {
      const va = a[sortField] ?? "";
      const vb = b[sortField] ?? "";
      const cmp = String(va).localeCompare(String(vb), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    pagination.setTotalItems(data.length);
    return data;
  }, [items, search, sortField, sortDir]);

  const projectIds = [...new Set(items.map(i => i.projectId || i.project_id).filter(Boolean))];

  const openCreate = () => {
    setEditing(null);
    setForm({ plannedAmount: "0", actualAmount: "0", earnedValue: "0", plannedValue: "0" });
    setShowForm(true);
  };

  const openEdit = (r: any) => {
    setEditing(r);
    setForm({ ...r });
    setShowForm(true);
  };

  const save = async () => {
    if (!validate(form)) return;
    setSaving(true);
    try {
      const url = editing ? `${API}/project-budget-lines/${editing.id}` : `${API}/project-budget-lines`;
      await authFetch(url, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setShowForm(false);
      load();
      if (selectedProjectId) loadEvm(selectedProjectId);
    } catch {}
    setSaving(false);
  };

  const remove = async (id: number) => {
    if (await globalConfirm("למחוק פריט תקציב? פעולה זו אינה ניתנת לביטול.")) {
      await authFetch(`${API}/project-budget-lines/${id}`, { method: "DELETE" });
      load();
    }
  };

  const takeSnapshot = async () => {
    if (!selectedProjectId) return;
    setSnapshotting(true);
    await authFetch(`${API}/project-evm/${selectedProjectId}/snapshot`, { method: "POST" });
    await loadEvm(selectedProjectId);
    setSnapshotting(false);
  };

  const totalPlanned = items.reduce((s, i) => s + parseFloat(i.plannedAmount || i.planned_amount || "0"), 0);
  const totalActual = items.reduce((s, i) => s + parseFloat(i.actualAmount || i.actual_amount || "0"), 0);
  const overBudgetLines = items.filter(i => parseFloat(i.actualAmount || i.actual_amount || "0") > parseFloat(i.plannedAmount || i.planned_amount || "0")).length;
  const burnRate = totalPlanned > 0 ? (totalActual / totalPlanned) * 100 : 0;

  const kpis = [
    { label: "תקציב מתוכנן", value: `₪${fmt(totalPlanned)}`, icon: Wallet, color: "text-blue-400" },
    { label: "עלות בפועל", value: `₪${fmt(totalActual)}`, icon: DollarSign, color: "text-red-400" },
    { label: "יתרה", value: `₪${fmt(totalPlanned - totalActual)}`, icon: PiggyBank, color: totalPlanned - totalActual >= 0 ? "text-green-400" : "text-red-400" },
    { label: "שיעור ניצול", value: `${burnRate.toFixed(1)}%`, icon: BarChart3, color: burnRate >= 100 ? "text-red-400" : burnRate >= 80 ? "text-yellow-400" : "text-purple-400" },
    { label: "חריגות", value: fmt(overBudgetLines), icon: AlertTriangle, color: overBudgetLines > 0 ? "text-orange-400" : "text-muted-foreground" },
  ];

  const sCurveData = evmHistory.map(s => ({
    date: s.snapshot_date,
    PV: parseFloat(s.pv || "0"),
    EV: parseFloat(s.ev || "0"),
    AC: parseFloat(s.ac || "0"),
  }));

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <DollarSign className="text-emerald-400 w-6 h-6" />
            תקציב ו-EVM
          </h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול תקציבים, מעקב הוצאות ו-Earned Value Management</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportDropdown
            data={filtered}
            headers={{ category: "קטגוריה", plannedAmount: "מתוכנן", actualAmount: "בפועל", earnedValue: "EV", plannedValue: "PV" }}
            filename="project_budget"
          />
          <button onClick={openCreate} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium">
            <Plus className="w-4 h-4" /> פריט תקציב חדש
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {kpis.map((kpi, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className="bg-card border border-border/50 rounded-2xl p-4">
            <kpi.icon className={`${kpi.color} w-5 h-5 mb-2`} />
            <div className="text-xl font-bold text-foreground">{kpi.value}</div>
            <div className="text-xs text-muted-foreground">{kpi.label}</div>
          </motion.div>
        ))}
      </div>

      {burnRate >= 80 && (
        <div className={`${burnRate >= 100 ? "bg-red-500/10 border-red-500/30" : "bg-yellow-500/10 border-yellow-500/30"} border rounded-xl p-4`}>
          <div className={`flex items-center gap-2 text-sm font-medium ${burnRate >= 100 ? "text-red-400" : "text-yellow-400"}`}>
            <AlertTriangle className="w-4 h-4" />
            {burnRate >= 100 ? "אזהרה: חריגה מהתקציב!" : `אזהרה: ניצול ${burnRate.toFixed(0)}% מהתקציב`}
          </div>
        </div>
      )}

      <div className="flex gap-2 border-b border-border/50">
        {([
          ["lines", "פריטי תקציב", BarChart3],
          ["evm", "מדדי EVM", Activity],
          ["history", "עקומת S", TrendingUp],
        ] as const).map(([key, label, Icon]) => (
          <button key={key} onClick={() => setActiveTab(key as Tab)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 ${activeTab === key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      {(activeTab === "evm" || activeTab === "history") && (
        <div className="flex items-center gap-3">
          <select value={selectedProjectId || ""} onChange={e => setSelectedProjectId(e.target.value ? Number(e.target.value) : null)}
            className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
            <option value="">בחר פרויקט לניתוח EVM</option>
            {projectIds.map(id => <option key={id} value={id}>פרויקט {id}</option>)}
          </select>
          {selectedProjectId && (
            <button onClick={takeSnapshot} disabled={snapshotting}
              className="flex items-center gap-2 px-4 py-2.5 bg-purple-500/20 text-purple-400 rounded-xl text-sm hover:bg-purple-500/30 disabled:opacity-50">
              <Camera className="w-4 h-4" /> {snapshotting ? "שומר..." : "צלם Snapshot"}
            </button>
          )}
        </div>
      )}

      {activeTab === "evm" && (
        <div className="space-y-4">
          {!selectedProjectId ? (
            <div className="text-center py-16 text-muted-foreground">
              <Activity className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>בחר פרויקט כדי לצפות במדדי EVM</p>
            </div>
          ) : evmLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Array.from({length:8}).map((_,i)=><div key={i} className="bg-card border border-border/50 rounded-2xl p-4 animate-pulse h-20" />)}
            </div>
          ) : evmData ? (
            <>
              {evmData.alerts?.includes("budget_exceeded") && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 flex items-center gap-2 text-red-400 text-sm">
                  <AlertTriangle className="w-4 h-4" /> התקציב חרג מהמתוכנן
                </div>
              )}
              {evmData.alerts?.includes("budget_warning_80") && !evmData.alerts?.includes("budget_exceeded") && (
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3 flex items-center gap-2 text-yellow-400 text-sm">
                  <AlertTriangle className="w-4 h-4" /> ניצול מעל 80% מהתקציב
                </div>
              )}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "PV (ערך מתוכנן)", value: `₪${fmt(evmData.pv)}`, color: "text-blue-400", icon: Wallet },
                  { label: "EV (ערך שהושג)", value: `₪${fmt(evmData.ev)}`, color: "text-green-400", icon: CheckCircle2 },
                  { label: "AC (עלות בפועל)", value: `₪${fmt(evmData.ac)}`, color: "text-red-400", icon: DollarSign },
                  { label: "BAC (תקציב כולל)", value: `₪${fmt(evmData.bac)}`, color: "text-purple-400", icon: PiggyBank },
                  { label: "EAC (תחזית עלות)", value: evmData.eac ? `₪${fmt(evmData.eac)}` : "—", color: "text-orange-400", icon: TrendingUp },
                  { label: "ETC (נותר להשלים)", value: evmData.etc ? `₪${fmt(evmData.etc)}` : "—", color: "text-cyan-400", icon: Activity },
                  { label: "VAC (שונות עלות)", value: evmData.vac ? `₪${fmt(evmData.vac)}` : "—", color: evmData.vac >= 0 ? "text-green-400" : "text-red-400", icon: TrendingDown },
                  { label: "השלמה", value: `${fmtN(evmData.completionPct, 0)}%`, color: "text-foreground", icon: BarChart3 },
                ].map((m, i) => (
                  <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                    className="bg-card border border-border/50 rounded-2xl p-4">
                    <m.icon className={`${m.color} w-5 h-5 mb-2`} />
                    <div className={`text-lg font-bold ${m.color}`}>{m.value}</div>
                    <div className="text-xs text-muted-foreground">{m.label}</div>
                  </motion.div>
                ))}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "CPI (ביצוע עלות)", value: evmData.cpi, good: "above" as const },
                  { label: "SPI (ביצוע לוח זמנים)", value: evmData.spi, good: "above" as const },
                  { label: "CV (שונות עלות)", value: evmData.cv !== null ? (evmData.cv >= 0 ? "חסכון" : "חריגה") : "—", raw: evmData.cv },
                  { label: "SV (שונות לוח זמנים)", value: evmData.sv !== null ? (evmData.sv >= 0 ? "מקדים" : "מפגר") : "—", raw: evmData.sv },
                ].map((m, i) => (
                  <div key={i} className="bg-card border border-border/50 rounded-2xl p-4">
                    <div className="text-xs text-muted-foreground mb-1">{m.label}</div>
                    {m.good !== undefined ? (
                      <div className="text-2xl font-bold"><EvmBadge value={m.value as number} good={m.good} /></div>
                    ) : (
                      <div className={`text-lg font-bold ${m.raw !== null ? (m.raw >= 0 ? "text-green-400" : "text-red-400") : "text-muted-foreground"}`}>
                        {m.value} {m.raw !== null ? `(₪${fmt(Math.abs(m.raw))})` : ""}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>
      )}

      {activeTab === "history" && (
        <div className="bg-card border border-border/50 rounded-2xl p-5">
          <h2 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-purple-400" /> עקומת S — PV / EV / AC לאורך זמן
          </h2>
          {!selectedProjectId ? (
            <p className="text-muted-foreground text-sm text-center py-12">בחר פרויקט</p>
          ) : sCurveData.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>אין היסטוריית EVM</p>
              <p className="text-xs mt-1">לחץ על "צלם Snapshot" ליצירת נקודת נתון</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={sCurveData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={v => `₪${(v/1000).toFixed(0)}K`} />
                <Tooltip
                  contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
                  formatter={(val: any) => [`₪${fmt(val)}`, undefined]}
                />
                <Legend wrapperStyle={{ color: "#94a3b8", fontSize: 12 }} />
                <Line type="monotone" dataKey="PV" stroke="#3b82f6" strokeWidth={2} dot={false} name="PV (מתוכנן)" />
                <Line type="monotone" dataKey="EV" stroke="#22c55e" strokeWidth={2} dot={false} name="EV (שהושג)" />
                <Line type="monotone" dataKey="AC" stroke="#ef4444" strokeWidth={2} dot={false} name="AC (בפועל)" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      {activeTab === "lines" && (
        <>
          <div className="flex gap-3 flex-wrap items-center">
            <div className="relative flex-1 min-w-0 sm:min-w-[200px] max-w-md">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש קטגוריה..."
                className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <span className="text-sm text-muted-foreground">{filtered.length} תוצאות</span>
          </div>

          <BulkActions selectedIds={selectedIds} onClear={clear} entityName="תקציבי פרויקטים" actions={defaultBulkActions(selectedIds, clear, load, `${API}/project-budget-lines`)} />

          {loading ? (
            <div className="border border-border/50 rounded-2xl bg-card/50 h-48 animate-pulse" />
          ) : error ? (
            <div className="text-center py-16 text-red-400">
              <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="font-medium">שגיאה בטעינה</p>
              <button onClick={load} className="mt-4 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm">נסה שנית</button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <DollarSign className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">אין פריטי תקציב</p>
              <p className="text-sm mt-1">{search ? "נסה לשנות את הסינון" : "לחץ על 'פריט חדש' כדי להתחיל"}</p>
            </div>
          ) : (
            <>
              <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/30 border-b border-border/50">
                      <tr>
                        <th className="px-2 py-3 w-8" />
                        {[
                          { key: "project_id", label: "פרויקט" },
                          { key: "category", label: "קטגוריה" },
                          { key: "planned_amount", label: "מתוכנן" },
                          { key: "actual_amount", label: "בפועל" },
                          { key: "planned_value", label: "PV" },
                          { key: "earned_value", label: "EV" },
                          { key: "variance", label: "שונות" },
                        ].map(col => (
                          <th key={col.key} onClick={() => {
                            if (sortField === col.key) setSortDir(d => d === "asc" ? "desc" : "asc");
                            else { setSortField(col.key); setSortDir("desc"); }
                          }} className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground">
                            <div className="flex items-center gap-1">{col.label}<ArrowUpDown className="w-3 h-3" /></div>
                          </th>
                        ))}
                        <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagination.paginate(filtered).map(r => {
                        const planned = parseFloat(r.plannedAmount || r.planned_amount || "0");
                        const actual = parseFloat(r.actualAmount || r.actual_amount || "0");
                        const pv = parseFloat(r.plannedValue || r.planned_value || "0");
                        const ev = parseFloat(r.earnedValue || r.earned_value || "0");
                        const variance = parseFloat(r.variance || "0") || (planned - actual);
                        const overBudget = actual > planned;
                        return (
                          <tr key={r.id} className={`border-b border-border/20 hover:bg-muted/20 transition-colors ${overBudget ? "bg-red-500/5" : ""}`}>
                            <td className="px-2 py-3"><BulkCheckbox checked={isSelected(r.id)} onChange={() => toggle(r.id)} /></td>
                            <td className="px-4 py-3 text-muted-foreground">{r.projectId || r.project_id || "—"}</td>
                            <td className="px-4 py-3 text-foreground font-medium">{r.category}</td>
                            <td className="px-4 py-3 text-blue-400">₪{fmt(planned)}</td>
                            <td className="px-4 py-3 text-red-400">₪{fmt(actual)}</td>
                            <td className="px-4 py-3 text-purple-400">₪{fmt(pv)}</td>
                            <td className="px-4 py-3 text-green-400">₪{fmt(ev)}</td>
                            <td className="px-4 py-3">
                              <span className={variance < 0 ? "text-red-400 font-bold" : "text-foreground"}>₪{fmt(variance)}</span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex gap-1">
                                <button onClick={() => setViewDetail(r)} className="p-1.5 hover:bg-muted rounded-lg"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                                <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button><button title="שכפול" onClick={async () => { const res = await duplicateRecord(`${API}/project-evm`, r.id); if (res.ok) { load(); } else { alert("שגיאה בשכפול: " + res.error); } }} className="p-1.5 hover:bg-muted rounded-lg"><Copy className="w-3.5 h-3.5 text-slate-400" /></button>
                                {isSuperAdmin && <button onClick={async () => { if (await globalConfirm(`למחוק את '${r.category}'?`)) remove(r.id); }} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              <SmartPagination pagination={pagination} />
            </>
          )}
        </>
      )}

      <AnimatePresence>
        {viewDetail && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => { setViewDetail(null); setDetailTab("details"); }}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground">{viewDetail.category}</h2>
                <button onClick={() => { setViewDetail(null); setDetailTab("details"); }} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex border-b border-border/50">
                {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t => (
                  <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${detailTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
                ))}
              </div>
              {detailTab === "details" && (
                <div className="p-5 grid grid-cols-2 gap-4">
                  <DetailField label="פרויקט" value={String(viewDetail.projectId || viewDetail.project_id || "—")} />
                  <DetailField label="קטגוריה" value={viewDetail.category} />
                  <DetailField label="תקציב מתוכנן" value={`₪${fmt(viewDetail.plannedAmount || viewDetail.planned_amount)}`} />
                  <DetailField label="עלות בפועל" value={`₪${fmt(viewDetail.actualAmount || viewDetail.actual_amount)}`} />
                  <DetailField label="PV (ערך מתוכנן)" value={`₪${fmt(viewDetail.plannedValue || viewDetail.planned_value)}`} />
                  <DetailField label="EV (ערך שהושג)" value={`₪${fmt(viewDetail.earnedValue || viewDetail.earned_value)}`} />
                  <DetailField label="שונות" value={`₪${fmt(viewDetail.variance || 0)}`} />
                  <div className="col-span-2"><DetailField label="הערות" value={viewDetail.notes} /></div>
                </div>
              )}
              {detailTab === "related" && <div className="p-5"><RelatedRecords entityType="project-budget" entityId={viewDetail.id} /></div>}
              {detailTab === "docs" && <div className="p-5"><AttachmentsSection entityType="project-budget" entityId={viewDetail.id} /></div>}
              {detailTab === "history" && <div className="p-5"><ActivityLog entityType="project-budget" entityId={viewDetail.id} /></div>}
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => { setViewDetail(null); openEdit(viewDetail); }}
                  className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg text-sm hover:bg-blue-500/30">
                  <Edit2 className="w-3.5 h-3.5 inline ml-1" /> עריכה
                </button>
                <button onClick={() => { setViewDetail(null); setDetailTab("details"); }} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">סגור</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground">{editing ? "עריכת פריט תקציב" : "פריט תקציב חדש"}</h2>
                <button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">מזהה פרויקט</label>
                  <input type="number" value={form.projectId || form.project_id || ""} onChange={e => setForm({ ...form, projectId: Number(e.target.value) })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">קטגוריה *</label>
                  <input value={form.category || ""} onChange={e => setForm({ ...form, category: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                  <FormFieldError error={errors.category} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">תקציב מתוכנן (₪)</label>
                  <input type="number" value={form.plannedAmount || form.planned_amount || ""} onChange={e => setForm({ ...form, plannedAmount: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">עלות בפועל (₪)</label>
                  <input type="number" value={form.actualAmount || form.actual_amount || ""} onChange={e => setForm({ ...form, actualAmount: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">PV — ערך מתוכנן (₪)</label>
                  <input type="number" value={form.plannedValue || form.planned_value || ""} onChange={e => setForm({ ...form, plannedValue: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">EV — ערך שהושג (₪)</label>
                  <input type="number" value={form.earnedValue || form.earned_value || ""} onChange={e => setForm({ ...form, earnedValue: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">הערות</label>
                  <textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })}
                    rows={2} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">ביטול</button>
                <button onClick={save} disabled={saving}
                  className="px-6 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90 disabled:opacity-50">
                  <Save className="w-3.5 h-3.5 inline ml-1" /> {editing ? "עדכון" : "שמירה"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
