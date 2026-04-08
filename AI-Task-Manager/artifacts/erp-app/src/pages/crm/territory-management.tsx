import { useState, useMemo, useEffect, useCallback } from "react";
import { authFetch } from "@/lib/utils";
import {
  MapPin, Users, Target, TrendingUp, Plus, Edit, Trash2, Search, Globe,
  BarChart3, UserCheck, DollarSign, Building2, ChevronDown, ChevronUp,
  ArrowUpDown, Loader2, X, Download, Printer, Eye, Map as MapIcon, Award
} from "lucide-react";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";

const API = "/api";
const getHeaders = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("erp_token") || ""}` });
const fmt = (n: number) => new Intl.NumberFormat("he-IL").format(n);
const fmtC = (n: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(n);
const pct = (n: number) => `${n.toFixed(1)}%`;

type Territory = {
  id: number;
  name: string;
  region: string;
  manager: string;
  repsCount: number;
  customerCount: number;
  revenueTarget: number;
  revenueActual: number;
  attainment: number;
  status: "active" | "inactive" | "planning";
  description: string;
  createdAt: string;
};

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  active: { label: "פעיל", color: "bg-green-500/20 text-green-400 border-green-500/30" },
  inactive: { label: "לא פעיל", color: "bg-red-500/20 text-red-400 border-red-500/30" },
  planning: { label: "בתכנון", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
};

const REGIONS = ["צפון", "מרכז", "דרום", "ירושלים והסביבה", "שפלה", "שרון", "נגב", "גליל"];

const INITIAL_DATA: Territory[] = [
  { id: 1, name: "אזור תל אביב מרכז", region: "מרכז", manager: "יוסי כהן", repsCount: 8, customerCount: 145, revenueTarget: 2500000, revenueActual: 2125000, attainment: 85.0, status: "active", description: "אזור מסחרי מרכזי", createdAt: "2025-01-15" },
  { id: 2, name: "חיפה והקריות", region: "צפון", manager: "שרה לוי", repsCount: 5, customerCount: 89, revenueTarget: 1800000, revenueActual: 1944000, attainment: 108.0, status: "active", description: "אזור תעשייתי צפוני", createdAt: "2025-01-15" },
  { id: 3, name: "באר שבע והנגב", region: "דרום", manager: "דוד מזרחי", repsCount: 4, customerCount: 62, revenueTarget: 1200000, revenueActual: 900000, attainment: 75.0, status: "active", description: "אזור מתפתח דרומי", createdAt: "2025-02-01" },
  { id: 4, name: "ירושלים", region: "ירושלים והסביבה", manager: "רחל אברהם", repsCount: 6, customerCount: 110, revenueTarget: 2000000, revenueActual: 1700000, attainment: 85.0, status: "active", description: "אזור ירושלים והסביבה", createdAt: "2025-01-15" },
  { id: 5, name: "השרון", region: "שרון", manager: "אלון גולדשטיין", repsCount: 4, customerCount: 73, revenueTarget: 1500000, revenueActual: 1350000, attainment: 90.0, status: "active", description: "אזור השרון", createdAt: "2025-03-01" },
  { id: 6, name: "אשדוד - אשקלון", region: "שפלה", manager: "מיכל דהן", repsCount: 3, customerCount: 48, revenueTarget: 900000, revenueActual: 630000, attainment: 70.0, status: "active", description: "אזור שפלה דרומית", createdAt: "2025-04-01" },
  { id: 7, name: "גליל עליון", region: "גליל", manager: "—", repsCount: 0, customerCount: 25, revenueTarget: 600000, revenueActual: 0, attainment: 0, status: "planning", description: "טריטוריה חדשה בתכנון", createdAt: "2026-03-01" },
  { id: 8, name: "אילת", region: "נגב", manager: "אבי פרץ", repsCount: 2, customerCount: 31, revenueTarget: 500000, revenueActual: 175000, attainment: 35.0, status: "inactive", description: "אזור מופסק זמנית", createdAt: "2025-06-01" },
];

export default function TerritoryManagement() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<Territory[]>([]);
  const [search, setSearch] = useState("");
  const [filterRegion, setFilterRegion] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [sortField, setSortField] = useState<string>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Territory | null>(null);
  const [form, setForm] = useState<any>({});
  const [tableLoading, setTableLoading] = useState(true);
  const [viewDetail, setViewDetail] = useState<Territory | null>(null);
  const { selectedIds, setSelectedIds, toggle, toggleAll, isSelected } = useBulkSelection();
  const validation = useFormValidation({ name: { required: true }, region: { required: true }, manager: { required: true } });

  const load = useCallback(() => {
    setTableLoading(true);
    authFetch(`${API}/crm-sap/territories`, { headers: getHeaders() })
      .then(r => r.json())
      .then(d => setItems(Array.isArray(d) ? d : INITIAL_DATA))
      .catch(() => setItems(INITIAL_DATA))
      .finally(() => setTableLoading(false));
  }, []);
  useEffect(load, [load]);

  const stats = useMemo(() => {
    const active = items.filter(i => i.status === "active");
    return {
      totalTerritories: items.length,
      totalReps: items.reduce((s, i) => s + i.repsCount, 0),
      totalRevenueTarget: items.reduce((s, i) => s + i.revenueTarget, 0),
      totalRevenueActual: items.reduce((s, i) => s + i.revenueActual, 0),
      avgAttainment: active.length ? active.reduce((s, i) => s + i.attainment, 0) / active.length : 0,
      totalCustomers: items.reduce((s, i) => s + i.customerCount, 0),
    };
  }, [items]);

  const filtered = useMemo(() => {
    let f = items.filter(r => {
      const s = `${r.name} ${r.region} ${r.manager}`.toLowerCase();
      if (search && !s.includes(search.toLowerCase())) return false;
      if (filterRegion && r.region !== filterRegion) return false;
      if (filterStatus && r.status !== filterStatus) return false;
      return true;
    });
    f.sort((a: any, b: any) => {
      const va = a[sortField], vb = b[sortField];
      const cmp = typeof va === "number" ? va - vb : String(va || "").localeCompare(String(vb || ""), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return f;
  }, [items, search, filterRegion, filterStatus, sortField, sortDir]);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", region: "", manager: "", repsCount: 0, customerCount: 0, revenueTarget: 0, revenueActual: 0, status: "planning", description: "" });
    validation.reset();
    setShowForm(true);
  };
  const openEdit = (r: Territory) => {
    setEditing(r);
    setForm({ name: r.name, region: r.region, manager: r.manager, repsCount: r.repsCount, customerCount: r.customerCount, revenueTarget: r.revenueTarget, revenueActual: r.revenueActual, status: r.status, description: r.description });
    validation.reset();
    setShowForm(true);
  };

  const save = async () => {
    if (!validation.validateAll(form)) return;
    try {
      const url = editing ? `${API}/crm-sap/territories/${editing.id}` : `${API}/crm-sap/territories`;
      const method = editing ? "PUT" : "POST";
      const attainment = form.revenueTarget > 0 ? (form.revenueActual / form.revenueTarget) * 100 : 0;
      await authFetch(url, { method, headers: getHeaders(), body: JSON.stringify({ ...form, attainment }) });
      setShowForm(false);
      load();
    } catch {
      const attainment = form.revenueTarget > 0 ? (form.revenueActual / form.revenueTarget) * 100 : 0;
      if (editing) {
        setItems(prev => prev.map(i => i.id === editing.id ? { ...i, ...form, attainment } : i));
      } else {
        setItems(prev => [...prev, { id: Date.now(), ...form, attainment, createdAt: new Date().toISOString().slice(0, 10) }]);
      }
      setShowForm(false);
    }
  };

  const remove = async (id: number) => {
    if (!(await globalConfirm("האם למחוק את הטריטוריה?"))) return;
    try {
      await authFetch(`${API}/crm-sap/territories/${id}`, { method: "DELETE", headers: getHeaders() });
    } catch {}
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };
  const SortIcon = ({ field }: { field: string }) => (
    <ArrowUpDown className={`inline w-3 h-3 mr-1 cursor-pointer ${sortField === field ? "text-primary" : "text-muted-foreground"}`} onClick={() => toggleSort(field)} />
  );

  const attColor = (v: number) => v >= 100 ? "text-green-400" : v >= 80 ? "text-blue-400" : v >= 60 ? "text-amber-400" : "text-red-400";

  return (
    <div dir="rtl" className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><MapIcon className="w-7 h-7 text-primary" /> ניהול טריטוריות מכירה</h1>
          <p className="text-muted-foreground mt-1">ניהול אזורי מכירה, נציגים ויעדי הכנסה</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition">
          <Plus className="w-4 h-4" /> טריטוריה חדשה
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        {[
          { label: "סה\"כ טריטוריות", value: fmt(stats.totalTerritories), icon: MapPin, color: "text-blue-400", bg: "bg-blue-500/10" },
          { label: "סה\"כ נציגים", value: fmt(stats.totalReps), icon: Users, color: "text-purple-400", bg: "bg-purple-500/10" },
          { label: "סה\"כ לקוחות", value: fmt(stats.totalCustomers), icon: Building2, color: "text-cyan-400", bg: "bg-cyan-500/10" },
          { label: "יעד הכנסה", value: fmtC(stats.totalRevenueTarget), icon: Target, color: "text-amber-400", bg: "bg-amber-500/10" },
          { label: "הכנסה בפועל", value: fmtC(stats.totalRevenueActual), icon: DollarSign, color: "text-green-400", bg: "bg-green-500/10" },
          { label: "% השגת יעד", value: pct(stats.avgAttainment), icon: TrendingUp, color: stats.avgAttainment >= 80 ? "text-green-400" : "text-red-400", bg: stats.avgAttainment >= 80 ? "bg-green-500/10" : "bg-red-500/10" },
        ].map((c, i) => (
          <div key={i} className={`rounded-xl border border-border/50 p-4 ${c.bg}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">{c.label}</span>
              <c.icon className={`w-5 h-5 ${c.color}`} />
            </div>
            <div className={`text-xl font-bold ${c.color}`}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש טריטוריה, אזור, מנהל..." className="w-full pr-10 pl-4 py-2 rounded-lg border border-border bg-card text-sm" />
        </div>
        <select value={filterRegion} onChange={e => setFilterRegion(e.target.value)} className="px-3 py-2 rounded-lg border border-border bg-card text-sm">
          <option value="">כל האזורים</option>
          {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-3 py-2 rounded-lg border border-border bg-card text-sm">
          <option value="">כל הסטטוסים</option>
          {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        {(search || filterRegion || filterStatus) && (
          <button onClick={() => { setSearch(""); setFilterRegion(""); setFilterStatus(""); }} className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1">
            <X className="w-3 h-3" /> נקה
          </button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b border-border">
              <tr>
                <th className="p-3 text-right font-medium"><BulkCheckbox checked={selectedIds.size === filtered.length && filtered.length > 0} onChange={() => toggleAll(filtered.map(r => r.id))} /></th>
                <th className="p-3 text-right font-medium cursor-pointer" onClick={() => toggleSort("name")}>שם טריטוריה <SortIcon field="name" /></th>
                <th className="p-3 text-right font-medium cursor-pointer" onClick={() => toggleSort("region")}>אזור <SortIcon field="region" /></th>
                <th className="p-3 text-right font-medium">מנהל</th>
                <th className="p-3 text-center font-medium cursor-pointer" onClick={() => toggleSort("repsCount")}>נציגים <SortIcon field="repsCount" /></th>
                <th className="p-3 text-center font-medium cursor-pointer" onClick={() => toggleSort("customerCount")}>לקוחות <SortIcon field="customerCount" /></th>
                <th className="p-3 text-right font-medium cursor-pointer" onClick={() => toggleSort("revenueTarget")}>יעד הכנסה <SortIcon field="revenueTarget" /></th>
                <th className="p-3 text-right font-medium cursor-pointer" onClick={() => toggleSort("revenueActual")}>הכנסה בפועל <SortIcon field="revenueActual" /></th>
                <th className="p-3 text-center font-medium cursor-pointer" onClick={() => toggleSort("attainment")}>% השגה <SortIcon field="attainment" /></th>
                <th className="p-3 text-center font-medium">סטטוס</th>
                <th className="p-3 text-center font-medium">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {tableLoading ? (
                <tr><td colSpan={11} className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={11} className="p-8 text-center text-muted-foreground">לא נמצאו טריטוריות</td></tr>
              ) : filtered.map(r => (
                <tr key={r.id} className="border-b border-border/50 hover:bg-muted/20 transition">
                  <td className="p-3"><BulkCheckbox checked={isSelected(r.id)} onChange={() => toggle(r.id)} /></td>
                  <td className="p-3 font-medium">{r.name}</td>
                  <td className="p-3"><span className="flex items-center gap-1"><Globe className="w-3 h-3 text-muted-foreground" />{r.region}</span></td>
                  <td className="p-3">{r.manager}</td>
                  <td className="p-3 text-center">{fmt(r.repsCount)}</td>
                  <td className="p-3 text-center">{fmt(r.customerCount)}</td>
                  <td className="p-3 text-left font-mono text-xs">{fmtC(r.revenueTarget)}</td>
                  <td className="p-3 text-left font-mono text-xs">{fmtC(r.revenueActual)}</td>
                  <td className="p-3 text-center">
                    <span className={`font-bold ${attColor(r.attainment)}`}>{pct(r.attainment)}</span>
                    <div className="w-full bg-muted/30 rounded-full h-1.5 mt-1">
                      <div className={`h-1.5 rounded-full ${r.attainment >= 100 ? "bg-green-500" : r.attainment >= 80 ? "bg-blue-500" : r.attainment >= 60 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${Math.min(r.attainment, 100)}%` }} />
                    </div>
                  </td>
                  <td className="p-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs border ${STATUS_MAP[r.status]?.color || ""}`}>{STATUS_MAP[r.status]?.label || r.status}</span>
                  </td>
                  <td className="p-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => setViewDetail(r)} className="p-1.5 rounded-lg hover:bg-muted/30" title="צפייה"><Eye className="w-4 h-4" /></button>
                      <button onClick={() => openEdit(r)} className="p-1.5 rounded-lg hover:bg-muted/30" title="עריכה"><Edit className="w-4 h-4" /></button>
                      <button onClick={() => remove(r.id)} className="p-1.5 rounded-lg hover:bg-red-500/20 text-red-400" title="מחיקה"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-3 border-t border-border text-xs text-muted-foreground flex items-center justify-between">
          <span>מציג {filtered.length} מתוך {items.length} טריטוריות</span>
          {selectedIds.size > 0 && <span className="text-primary font-medium">{selectedIds.size} נבחרו</span>}
        </div>
      </div>

      {/* Detail Modal */}
      {viewDetail && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setViewDetail(null)}>
          <div className="bg-card rounded-2xl border border-border w-full max-w-lg p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold flex items-center gap-2"><MapPin className="w-5 h-5 text-primary" />{viewDetail.name}</h2>
              <button onClick={() => setViewDetail(null)} className="p-1 rounded hover:bg-muted/30"><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-muted-foreground">אזור:</span> {viewDetail.region}</div>
              <div><span className="text-muted-foreground">מנהל:</span> {viewDetail.manager}</div>
              <div><span className="text-muted-foreground">נציגים:</span> {viewDetail.repsCount}</div>
              <div><span className="text-muted-foreground">לקוחות:</span> {viewDetail.customerCount}</div>
              <div><span className="text-muted-foreground">יעד הכנסה:</span> {fmtC(viewDetail.revenueTarget)}</div>
              <div><span className="text-muted-foreground">הכנסה בפועל:</span> {fmtC(viewDetail.revenueActual)}</div>
              <div><span className="text-muted-foreground">% השגה:</span> <span className={attColor(viewDetail.attainment)}>{pct(viewDetail.attainment)}</span></div>
              <div><span className="text-muted-foreground">סטטוס:</span> <span className={`px-2 py-0.5 rounded-full text-xs border ${STATUS_MAP[viewDetail.status]?.color}`}>{STATUS_MAP[viewDetail.status]?.label}</span></div>
            </div>
            {viewDetail.description && <p className="text-sm text-muted-foreground border-t border-border pt-3">{viewDetail.description}</p>}
          </div>
        </div>
      )}

      {/* Create/Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-card rounded-2xl border border-border w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">{editing ? "עריכת טריטוריה" : "טריטוריה חדשה"}</h2>
              <button onClick={() => setShowForm(false)} className="p-1 rounded hover:bg-muted/30"><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">שם טריטוריה <RequiredMark /></label>
                <input value={form.name || ""} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm" placeholder="שם הטריטוריה" />
                <FormFieldError error={validation.errors.name} />
              </div>
              <div>
                <label className="text-sm font-medium">אזור <RequiredMark /></label>
                <select value={form.region || ""} onChange={e => setForm({ ...form, region: e.target.value })} className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm">
                  <option value="">בחר אזור</option>
                  {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <FormFieldError error={validation.errors.region} />
              </div>
              <div>
                <label className="text-sm font-medium">מנהל <RequiredMark /></label>
                <input value={form.manager || ""} onChange={e => setForm({ ...form, manager: e.target.value })} className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm" placeholder="שם מנהל" />
                <FormFieldError error={validation.errors.manager} />
              </div>
              <div>
                <label className="text-sm font-medium">סטטוס</label>
                <select value={form.status || "planning"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm">
                  {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">מספר נציגים</label>
                <input type="number" min={0} value={form.repsCount || 0} onChange={e => setForm({ ...form, repsCount: Number(e.target.value) })} className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm" />
              </div>
              <div>
                <label className="text-sm font-medium">מספר לקוחות</label>
                <input type="number" min={0} value={form.customerCount || 0} onChange={e => setForm({ ...form, customerCount: Number(e.target.value) })} className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm" />
              </div>
              <div>
                <label className="text-sm font-medium">יעד הכנסה (₪)</label>
                <input type="number" min={0} value={form.revenueTarget || 0} onChange={e => setForm({ ...form, revenueTarget: Number(e.target.value) })} className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm" />
              </div>
              <div>
                <label className="text-sm font-medium">הכנסה בפועל (₪)</label>
                <input type="number" min={0} value={form.revenueActual || 0} onChange={e => setForm({ ...form, revenueActual: Number(e.target.value) })} className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm" />
              </div>
              <div className="md:col-span-2">
                <label className="text-sm font-medium">תיאור</label>
                <textarea value={form.description || ""} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm" placeholder="תיאור הטריטוריה..." />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-muted/30 transition">ביטול</button>
              <button onClick={save} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:bg-primary/90 transition">{editing ? "עדכון" : "יצירה"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
