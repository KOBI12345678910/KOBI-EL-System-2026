import { useState, useEffect, useMemo, Fragment } from "react";
import { authFetch } from "@/lib/utils";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import {
  MapPin, Plus, Edit, Trash2, X, Save, Search, Users, Target,
  DollarSign, TrendingUp, RefreshCw, Building2, ArrowUpDown, ChevronDown, ChevronUp
} from "lucide-react";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";

const API = "/api";
const fmtC = (n: any) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(Number(n || 0));
const fmt = (n: any) => Number(n || 0).toLocaleString("he-IL");

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  active: { label: "פעיל", color: "bg-green-500/20 text-green-400" },
  inactive: { label: "לא פעיל", color: "bg-muted/20 text-muted-foreground" },
};

const TYPES = ["geographic", "custom", "product_based", "industry_based"];
const TYPE_LABELS: Record<string, string> = {
  geographic: "גאוגרפי", custom: "מותאם", product_based: "לפי מוצר", industry_based: "לפי ענף"
};

export default function SalesTerritories() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [sortField, setSortField] = useState("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [expandedData, setExpandedData] = useState<any>({});
  const [expandedLoading, setExpandedLoading] = useState(false);
  const pagination = useSmartPagination(20);

  const load = () => {
    setLoading(true);
    Promise.all([
      authFetch(`${API}/sales/territories`).then(r => r.json()).then(d => setItems(Array.isArray(d) ? d : [])).catch(() => setItems([])),
      authFetch(`${API}/sales/territories/stats`).then(r => r.json()).then(setStats).catch(() => {}),
    ]).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const filtered = useMemo(() => {
    let f = items.filter(r => {
      if (!search) return true;
      const s = `${r.name} ${r.region} ${r.assigned_rep} ${r.type}`.toLowerCase();
      return s.includes(search.toLowerCase());
    });
    f.sort((a, b) => {
      const va = a[sortField] ?? ""; const vb = b[sortField] ?? "";
      const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    pagination.setTotalItems(f.length);
    return f;
  }, [items, search, sortField, sortDir]);

  const toggleSort = (f: string) => {
    if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(f); setSortDir("asc"); }
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ status: "active", type: "geographic", targetRevenue: 0, actualRevenue: 0 });
    setShowForm(true);
  };
  const openEdit = (r: any) => {
    setEditing(r);
    setForm({
      name: r.name, description: r.description, type: r.type, region: r.region,
      country: r.country, cities: r.cities, zipCodes: r.zip_codes,
      assignedRep: r.assigned_rep, manager: r.manager, status: r.status,
      targetRevenue: r.target_revenue, actualRevenue: r.actual_revenue,
      customerCount: r.customer_count, leadCount: r.lead_count, notes: r.notes,
    });
    setShowForm(true);
  };

  const save = async () => {
    if (!form.name) return;
    setSaving(true);
    try {
      const url = editing ? `${API}/sales/territories/${editing.id}` : `${API}/sales/territories`;
      await authFetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setShowForm(false); load();
    } finally { setSaving(false); }
  };

  const remove = async (id: number, name: string) => {
    if (await globalConfirm(`למחוק את הטריטוריה '${name}'?`)) {
      await authFetch(`${API}/sales/territories/${id}`, { method: "DELETE" }); load();
    }
  };

  const toggleExpand = async (id: number) => {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (!expandedData[id]) {
      setExpandedLoading(true);
      try {
        const r = await authFetch(`${API}/sales/territories/${id}/opportunities`);
        const d = await r.json();
        setExpandedData((prev: any) => ({ ...prev, [id]: d }));
      } catch { setExpandedData((prev: any) => ({ ...prev, [id]: { opportunities: [] } })); }
      finally { setExpandedLoading(false); }
    }
  };

  const achievement = stats.total_target > 0 ? Math.round((stats.total_actual / stats.total_target) * 100) : 0;

  const kpis = [
    { label: "טריטוריות פעילות", value: fmt(stats.active_count || 0), icon: MapPin, color: "text-blue-400" },
    { label: "יעד כולל", value: fmtC(stats.total_target || 0), icon: Target, color: "text-purple-400" },
    { label: "הכנסות בפועל", value: fmtC(stats.total_actual || 0), icon: DollarSign, color: "text-green-400" },
    { label: "השגת יעד", value: `${achievement}%`, icon: TrendingUp, color: achievement >= 100 ? "text-green-400" : "text-amber-400" },
    { label: "סה\"כ לקוחות", value: fmt(stats.total_customers || 0), icon: Building2, color: "text-cyan-400" },
    { label: "נציגים מוקצים", value: fmt(stats.reps_assigned || 0), icon: Users, color: "text-indigo-400" },
  ];

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MapPin className="w-6 h-6 text-blue-400" />
            ניהול טריטוריות מכירה
          </h1>
          <p className="text-sm text-muted-foreground mt-1">הגדרת טריטוריות, הקצאת נציגים ומעקב ביצועים</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="flex items-center gap-1.5 bg-card border border-border px-3 py-2.5 rounded-xl text-sm hover:bg-muted">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button onClick={openCreate} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium">
            <Plus className="w-4 h-4" /> טריטוריה חדשה
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((k, i) => (
          <div key={i} className="bg-card border border-border/50 rounded-2xl p-4">
            <k.icon className={`${k.color} w-5 h-5 mb-2`} />
            <div className="text-xl font-bold">{k.value}</div>
            <div className="text-xs text-muted-foreground">{k.label}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-0 sm:min-w-[200px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש לפי שם, אזור, נציג..." className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
        <span className="text-sm text-muted-foreground">{filtered.length} טריטוריות</span>
      </div>

      <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b border-border/50">
              <tr>
                {[
                  { key: "name", label: "שם" },
                  { key: "type", label: "סוג" },
                  { key: "region", label: "אזור" },
                  { key: "assigned_rep", label: "נציג" },
                  { key: "target_revenue", label: "יעד" },
                  { key: "actual_revenue", label: "בפועל" },
                  { key: "customer_count", label: "לקוחות" },
                  { key: "status", label: "סטטוס" },
                ].map(col => (
                  <th key={col.key} onClick={() => toggleSort(col.key)} className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground">
                    <div className="flex items-center gap-1">{col.label}<ArrowUpDown className="w-3 h-3" /></div>
                  </th>
                ))}
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {loading ? Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-border/20">
                  {Array.from({ length: 9 }).map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 bg-muted/30 rounded animate-pulse" /></td>
                  ))}
                </tr>
              )) : pagination.paginate(filtered).length === 0 ? (
                <tr><td colSpan={9} className="text-center py-10 text-muted-foreground">אין טריטוריות — לחץ "טריטוריה חדשה"</td></tr>
              ) : pagination.paginate(filtered).map(r => {
                const ach = r.target_revenue > 0 ? Math.round((r.actual_revenue / r.target_revenue) * 100) : 0;
                const sm = STATUS_MAP[r.status] || { label: r.status, color: "bg-muted/20 text-muted-foreground" };
                const isExpanded = expandedId === r.id;
                const oppData = expandedData[r.id];
                return (
                  <Fragment key={r.id}>
                    <tr className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-medium text-foreground">{r.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{TYPE_LABELS[r.type] || r.type || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{r.region || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{r.assigned_rep || "—"}</td>
                      <td className="px-4 py-3 font-bold">{fmtC(r.target_revenue)}</td>
                      <td className="px-4 py-3">
                        <span className={`font-bold ${ach >= 100 ? "text-green-400" : ach >= 75 ? "text-amber-400" : "text-foreground"}`}>{fmtC(r.actual_revenue)}</span>
                        <span className="text-xs text-muted-foreground ml-1">({ach}%)</span>
                      </td>
                      <td className="px-4 py-3 text-center text-muted-foreground">{fmt(r.customer_count)}</td>
                      <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-xs ${sm.color}`}>{sm.label}</span></td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button onClick={() => toggleExpand(r.id)} className="p-1.5 hover:bg-muted rounded-lg" title="הזדמנויות">
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-purple-400" /> : <ChevronDown className="w-3.5 h-3.5 text-purple-400" />}
                          </button>
                          <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg"><Edit className="w-3.5 h-3.5 text-blue-400" /></button>
                          <button onClick={() => remove(r.id, r.name)} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-muted/10">
                        <td colSpan={9} className="px-6 py-4">
                          <div className="text-xs font-semibold text-purple-400 mb-2">הזדמנויות פתוחות בטריטוריה: {r.name}</div>
                          {expandedLoading && !oppData ? (
                            <div className="text-xs text-muted-foreground animate-pulse">טוען הזדמנויות...</div>
                          ) : !oppData?.opportunities?.length ? (
                            <div className="text-xs text-muted-foreground">אין הזדמנויות פתוחות בטריטוריה זו</div>
                          ) : (
                            <div className="space-y-1.5 max-h-48 overflow-y-auto">
                              {oppData.opportunities.map((opp: any) => (
                                <div key={opp.id} className="flex items-center gap-3 text-xs bg-card/50 rounded-lg px-3 py-2">
                                  <span className="font-medium text-foreground flex-1">{opp.name || opp.customer_name}</span>
                                  <span className="text-muted-foreground">{opp.assigned_rep || "—"}</span>
                                  <span className="text-purple-300">{opp.stage}</span>
                                  <span className="text-green-400 font-bold">{fmtC(opp.value)}</span>
                                  <span className="text-muted-foreground">{opp.probability || 0}%</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <SmartPagination pagination={pagination} />

      {showForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-border flex justify-between items-center">
              <h2 className="text-lg font-bold">{editing ? "עריכת טריטוריה" : "טריטוריה חדשה"}</h2>
              <button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-muted-foreground mb-1.5">שם הטריטוריה *</label>
                <input value={form.name || ""} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="לדוגמה: צפון ישראל" />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1.5">סוג</label>
                <select value={form.type || "geographic"} onChange={e => setForm({ ...form, type: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                  {TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1.5">סטטוס</label>
                <select value={form.status || "active"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                  <option value="active">פעיל</option>
                  <option value="inactive">לא פעיל</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1.5">אזור</label>
                <input value={form.region || ""} onChange={e => setForm({ ...form, region: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="לדוגמה: צפון" />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1.5">מדינה</label>
                <input value={form.country || ""} onChange={e => setForm({ ...form, country: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="ישראל" />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1.5">נציג אחראי</label>
                <input value={form.assignedRep || ""} onChange={e => setForm({ ...form, assignedRep: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1.5">מנהל</label>
                <input value={form.manager || ""} onChange={e => setForm({ ...form, manager: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1.5">יעד הכנסות (₪)</label>
                <input type="number" value={form.targetRevenue || 0} onChange={e => setForm({ ...form, targetRevenue: Number(e.target.value) })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1.5">הכנסות בפועל (₪)</label>
                <input type="number" value={form.actualRevenue || 0} onChange={e => setForm({ ...form, actualRevenue: Number(e.target.value) })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1.5">מספר לקוחות</label>
                <input type="number" value={form.customerCount || 0} onChange={e => setForm({ ...form, customerCount: Number(e.target.value) })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1.5">מספר לידים</label>
                <input type="number" value={form.leadCount || 0} onChange={e => setForm({ ...form, leadCount: Number(e.target.value) })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-muted-foreground mb-1.5">ערים / אזורים</label>
                <input value={form.cities || ""} onChange={e => setForm({ ...form, cities: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="חיפה, נצרת, עפולה..." />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-muted-foreground mb-1.5">הערות</label>
                <textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
              </div>
            </div>
            <div className="p-5 border-t border-border flex justify-end gap-2">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">ביטול</button>
              <button onClick={save} disabled={saving || !form.name} className="px-6 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90 disabled:opacity-50">
                <Save className="w-3.5 h-3.5 inline ml-1" />{editing ? "עדכון" : "שמירה"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
