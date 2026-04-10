import { useState, useEffect, useMemo, useCallback } from "react";
import {
  BarChart3, Search, AlertTriangle, ArrowUpDown, Eye, X, Users,
  DollarSign, Clock, TrendingUp, Printer, Send, Mail, Edit2, Trash2, Save, Plus,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell,
} from "recharts";
import ExportDropdown from "@/components/export-dropdown";
import { globalConfirm } from "@/components/confirm-dialog";
import { printPage, sendByEmail, generateEmailBody } from "@/lib/print-utils";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { authFetch } from "@/lib/utils";
import { usePermissions } from "@/hooks/use-permissions";
import BulkActions, { useBulkSelection, defaultBulkActions } from "@/components/bulk-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtC = (v: any) => `₪${fmt(v)}`;

interface AgingItem {
  id?: number;
  entity_name: string;
  entity_type: string;
  current: number;
  days_30: number;
  days_60: number;
  days_90: number;
  days_120_plus: number;
  total: number;
  notes?: string;
  last_payment_date?: string;
}

const BUCKETS = [
  { key: "current", label: "שוטף (0-30)", color: "#10b981", bgClass: "from-emerald-500/15 to-emerald-600/5 border-emerald-500/20", textClass: "text-emerald-400" },
  { key: "days_30", label: "31-60 יום", color: "#f59e0b", bgClass: "from-amber-500/15 to-amber-600/5 border-amber-500/20", textClass: "text-amber-400" },
  { key: "days_60", label: "61-90 יום", color: "#f97316", bgClass: "from-orange-500/15 to-orange-600/5 border-orange-500/20", textClass: "text-orange-400" },
  { key: "days_90", label: "91-120 יום", color: "#ef4444", bgClass: "from-red-500/15 to-red-600/5 border-red-500/20", textClass: "text-red-400" },
  { key: "days_120_plus", label: "120+ יום", color: "#dc2626", bgClass: "from-red-600/20 to-red-700/5 border-red-600/30", textClass: "text-red-500" },
] as const;

const entityTypeMap: Record<string, { label: string; color: string }> = {
  customer: { label: "לקוח", color: "bg-blue-500/20 text-blue-400" },
  supplier: { label: "ספק", color: "bg-purple-500/20 text-purple-400" },
};

function getRisk(item: AgingItem): "low" | "medium" | "high" | "critical" {
  const overdue90 = Number(item.days_90 || 0) + Number(item.days_120_plus || 0);
  const total = Number(item.total || 1);
  if (overdue90 > total * 0.5) return "critical";
  if (Number(item.days_60 || 0) + overdue90 > total * 0.3) return "high";
  if (Number(item.days_30 || 0) > 0) return "medium";
  return "low";
}

const riskConfig: Record<string, { label: string; color: string }> = {
  low: { label: "נמוך", color: "bg-emerald-500/20 text-emerald-300" },
  medium: { label: "בינוני", color: "bg-amber-500/20 text-amber-300" },
  high: { label: "גבוה", color: "bg-orange-500/20 text-orange-300" },
  critical: { label: "קריטי", color: "bg-red-500/20 text-red-300" },
};



const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-xl text-right" dir="rtl">
      <p className="text-sm font-medium text-foreground mb-2">{label}</p>
      {payload.map((entry: any, i: number) => (
        <div key={i} className="flex items-center justify-between gap-4 text-xs">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />{entry.name}</span>
          <span className="font-mono text-foreground">{fmtC(entry.value)}</span>
        </div>
      ))}
    </div>
  );
};
const setShowCreate: any[] = [];
export default function AgingReportPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<AgingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({});
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterRisk, setFilterRisk] = useState("all");
  const [sortField, setSortField] = useState("total");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [viewDetail, setViewDetail] = useState<AgingItem | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AgingItem | null>(null);
  const pagination = useSmartPagination(25);
  const { selectedIds, setSelectedIds, toggle, toggleAll, isSelected } = useBulkSelection();

  const load = async () => {
    setLoading(true);
    try {
      const res = await authFetch(`${API}/aging-report`);
      if (res.ok) {
        const data = safeArray(await res.json());
        setItems(data.length > 0 ? data : []);
      } else {
        setItems([]);
      }
    } catch {
      setItems([]);
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggleSort = (f: string) => { if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField(f); setSortDir("desc"); } };

  const filtered = useMemo(() => {
    let data = items.filter(i =>
      (filterType === "all" || i.entity_type === filterType) &&
      (filterRisk === "all" || getRisk(i) === filterRisk) &&
      (!search || i.entity_name?.toLowerCase().includes(search.toLowerCase()))
    );
    data.sort((a: any, b: any) => {
      const va = a[sortField] ?? "", vb = b[sortField] ?? "";
      const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return data;
  }, [items, search, filterType, filterRisk, sortField, sortDir]);

  const bucketTotals = useMemo(() => BUCKETS.map(b => ({
    ...b, value: items.reduce((s, i) => s + Number((i as any)[b.key] || 0), 0),
  })), [items]);

  const grandTotal = useMemo(() => items.reduce((s, i) => s + Number(i.total || 0), 0), [items]);
  const overdue60Plus = useMemo(() => items.reduce((s, i) => s + Number(i.days_60 || 0) + Number(i.days_90 || 0) + Number(i.days_120_plus || 0), 0), [items]);
  const criticalCount = useMemo(() => items.filter(i => getRisk(i) === "critical").length, [items]);

  const chartData = useMemo(() => {
    const top10 = [...items].sort((a, b) => b.total - a.total).slice(0, 10);
    return top10.map(i => ({
      name: i.entity_name.length > 12 ? i.entity_name.slice(0, 12) + "…" : i.entity_name,
      current: i.current, days_30: i.days_30, days_60: i.days_60, days_90: i.days_90, days_120_plus: i.days_120_plus,
    }));
  }, [items]);

  const pieData = useMemo(() => bucketTotals.filter(b => b.value > 0).map(b => ({ name: b.label, value: b.value, color: b.color })), [bucketTotals]);

  const openCreate = () => {
    setEditing(null);
    setForm({ entity_name: "", entity_type: "customer", current: 0, days_30: 0, days_60: 0, days_90: 0, days_120_plus: 0, notes: "" });
    setShowForm(true);
  };

  const openEdit = (r: AgingItem) => {
    setEditing(r);
    setForm({ entity_name: r.entity_name, entity_type: r.entity_type, current: r.current, days_30: r.days_30, days_60: r.days_60, days_90: r.days_90, days_120_plus: r.days_120_plus, notes: r.notes || "" });
    setShowForm(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const total = (Number(form.current) || 0) + (Number(form.days_30) || 0) + (Number(form.days_60) || 0) + (Number(form.days_90) || 0) + (Number(form.days_120_plus) || 0);
      const url = editing ? `${API}/aging-report/${editing.id}` : `${API}/aging-report`;
      await authFetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, total }) });
      setShowForm(false); load();
    } catch {}
    setSaving(false);
  };

  const remove = async (r: AgingItem) => {
    await authFetch(`${API}/aging-report/${r.id}`, { method: "DELETE" });
    load();
  };

  const af = [filterType !== "all", filterRisk !== "all"].filter(Boolean).length;

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><BarChart3 className="text-cyan-400" /> גיול חובות</h1>
          <p className="text-sm text-muted-foreground mt-1">ניתוח גיול חובות לקוחות וספקים לפי טווחי זמן</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportDropdown data={filtered} headers={{ entity_name: "שם", entity_type: "סוג", current: "שוטף", days_30: "31-60", days_60: "61-90", days_90: "91-120", days_120_plus: "120+", total: "סה״כ" }} filename="aging_report" />
          <Button variant="outline" onClick={() => printPage("גיול חובות")} className="border-border text-muted-foreground gap-1"><Printer className="h-4 w-4" />הדפסה</Button>
          <Button onClick={openCreate} className="bg-cyan-600 hover:bg-cyan-700 gap-1"><Plus className="h-4 w-4" />רשומה חדשה</Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-gradient-to-br from-blue-500/15 to-blue-600/5 border-blue-500/20">
          <CardContent className="p-4">
            <DollarSign className="h-5 w-5 text-blue-400 mb-1.5" />
            <p className="text-xl font-bold font-mono text-blue-400">{fmtC(grandTotal)}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">סה״כ חוב פתוח</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-red-500/15 to-red-600/5 border-red-500/20">
          <CardContent className="p-4">
            <AlertTriangle className="h-5 w-5 text-red-400 mb-1.5" />
            <p className="text-xl font-bold font-mono text-red-400">{fmtC(overdue60Plus)}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">חוב באיחור 60+ יום</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-amber-500/15 to-amber-600/5 border-amber-500/20">
          <CardContent className="p-4">
            <Users className="h-5 w-5 text-amber-400 mb-1.5" />
            <p className="text-xl font-bold font-mono text-amber-400">{items.length}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">ישויות פתוחות ({criticalCount} קריטי)</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {bucketTotals.map((b, i) => {
          const pct = grandTotal > 0 ? (b.value / grandTotal) * 100 : 0;
          return (
            <Card key={i} className={`bg-gradient-to-br ${b.bgClass}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground">{b.label}</span>
                  <span className="text-[10px] font-mono text-muted-foreground">{pct.toFixed(1)}%</span>
                </div>
                <p className={`text-lg font-bold font-mono ${b.textClass}`}>{fmtC(b.value)}</p>
                <div className="mt-2 bg-muted rounded-full h-1.5">
                  <div className="h-1.5 rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: b.color }} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="bg-card/80 border-border">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2"><BarChart3 className="h-4 w-4 text-cyan-400" />פילוח גיול לפי ישות (טופ 10)</CardTitle></CardHeader>
          <CardContent className="pt-0">
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3e" />
                  <XAxis type="number" tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={{ stroke: "#2a2a3e" }} tickFormatter={(v) => `₪${(v / 1000).toFixed(0)}K`} />
                  <YAxis type="category" dataKey="name" tick={{ fill: "#9ca3af", fontSize: 11 }} axisLine={{ stroke: "#2a2a3e" }} width={90} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend formatter={(v) => <span className="text-xs text-muted-foreground">{BUCKETS.find(b => b.key === v)?.label || v}</span>} />
                  {BUCKETS.map(b => <Bar key={b.key} dataKey={b.key} stackId="a" fill={b.color} name={b.key} />)}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/80 border-border">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2"><Clock className="h-4 w-4 text-amber-400" />התפלגות לפי טווח זמן</CardTitle></CardHeader>
          <CardContent className="pt-0">
            <div className="h-[200px] flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} strokeWidth={0}>
                    {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => fmtC(v)} contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", direction: "rtl" }} itemStyle={{ color: "hsl(var(--foreground))" }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {bucketTotals.map((b, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: b.color }} />
                  <span className="text-muted-foreground truncate">{b.label}</span>
                  <span className="text-foreground font-mono mr-auto">{fmtC(b.value)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card/60 border-border"><CardContent className="p-3"><div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]"><Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={e => { setSearch(e.target.value); pagination.setPage(1); }} placeholder="חיפוש לפי שם..." className="pr-9 bg-input border-border text-foreground" /></div>
        <select value={filterType} onChange={e => { setFilterType(e.target.value); pagination.setPage(1); }} className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground"><option value="all">כל הסוגים</option><option value="customer">לקוחות</option><option value="supplier">ספקים</option></select>
        <select value={filterRisk} onChange={e => { setFilterRisk(e.target.value); pagination.setPage(1); }} className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground"><option value="all">כל רמות הסיכון</option>{Object.entries(riskConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        {af > 0 && <Button variant="ghost" size="sm" onClick={() => { setFilterType("all"); setFilterRisk("all"); setSearch(""); }} className="text-red-400 hover:text-red-300 gap-1"><X className="h-3 w-3" />נקה ({af})</Button>}
      </div></CardContent></Card>

      <Card className="bg-card/80 border-border"><CardContent className="p-0">
        <div className="overflow-x-auto relative">
          {loading && <div className="absolute inset-0 bg-background/60 backdrop-blur-[1px] flex items-center justify-center z-10"><div className="flex items-center gap-2 bg-card border border-border rounded-lg px-4 py-2 shadow-lg"><Clock className="w-4 h-4 animate-spin text-cyan-400" /><span className="text-sm text-foreground">טוען נתוני גיול...</span></div></div>}
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border bg-background/50">
              <th className="px-3 py-3 w-10"><input type="checkbox" className="rounded" onChange={() => toggleAll(filtered)} /></th>
              <th className="px-3 py-3 text-right text-muted-foreground font-medium text-xs cursor-pointer hover:text-foreground" onClick={() => toggleSort("entity_name")}><div className="flex items-center gap-1">שם<ArrowUpDown className="h-3 w-3" /></div></th>
              <th className="px-3 py-3 text-right text-muted-foreground font-medium text-xs">סוג</th>
              {BUCKETS.map(b => (
                <th key={b.key} className="px-3 py-3 text-right font-medium text-xs cursor-pointer hover:text-foreground" onClick={() => toggleSort(b.key)} style={{ color: b.color }}><div className="flex items-center gap-1">{b.label.split(" ")[0]}<ArrowUpDown className="h-3 w-3" /></div></th>
              ))}
              <th className="px-3 py-3 text-right text-muted-foreground font-medium text-xs cursor-pointer hover:text-foreground" onClick={() => toggleSort("total")}><div className="flex items-center gap-1">סה״כ<ArrowUpDown className="h-3 w-3" /></div></th>
              <th className="px-3 py-3 text-center text-muted-foreground font-medium text-xs">סיכון</th>
              <th className="px-3 py-3 text-center text-muted-foreground font-medium text-xs">גיול ויזואלי</th>
              <th className="px-3 py-3 text-center text-muted-foreground font-medium text-xs">פעולות</th>
            </tr></thead>
            <tbody>
              {!loading && pagination.paginate(filtered).length === 0 ? (
                <tr><td colSpan={11} className="p-16 text-center"><div className="flex flex-col items-center gap-4"><BarChart3 className="h-12 w-12 text-muted-foreground" /><p className="text-lg font-medium text-muted-foreground">{(af > 0 || search) ? "לא נמצאו תוצאות" : "אין נתוני גיול"}</p></div></td></tr>
              ) : pagination.paginate(filtered).map(r => {
                const risk = getRisk(r);
                const total = Number(r.total) || 1;
                return (
                  <tr key={r.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => setViewDetail(r)}>
                    <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}><input type="checkbox" checked={isSelected(String(r.id))} onChange={() => toggle(String(r.id))} className="rounded" /></td>
                    <td className="px-3 py-2.5 text-foreground font-medium max-w-[150px] truncate">{r.entity_name}</td>
                    <td className="px-3 py-2.5"><Badge className={`${entityTypeMap[r.entity_type]?.color || "bg-muted"} border-0 text-[10px]`}>{entityTypeMap[r.entity_type]?.label || r.entity_type}</Badge></td>
                    {BUCKETS.map(b => {
                      const val = Number((r as any)[b.key] || 0);
                      return <td key={b.key} className="px-3 py-2.5 font-mono text-xs" style={{ color: val > 0 ? b.color : "#4b5563" }}>{val > 0 ? fmtC(val) : "—"}</td>;
                    })}
                    <td className="px-3 py-2.5 font-mono text-sm text-foreground font-bold">{fmtC(r.total)}</td>
                    <td className="px-3 py-2.5 text-center"><Badge className={`${riskConfig[risk]?.color} border-0 text-[10px]`}>{riskConfig[risk]?.label}</Badge></td>
                    <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                      <div className="flex h-3 rounded-full overflow-hidden bg-muted min-w-[100px]">
                        {BUCKETS.map(b => {
                          const val = Number((r as any)[b.key] || 0);
                          const pct = (val / total) * 100;
                          return pct > 0 ? <div key={b.key} className="h-full" style={{ width: `${pct}%`, backgroundColor: b.color }} title={`${b.label}: ${fmtC(val)}`} /> : null;
                        })}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" onClick={() => setViewDetail(r)}><Eye className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-blue-400" onClick={() => openEdit(r)}><Edit2 className="h-3.5 w-3.5" /></Button>
                        {isSuperAdmin && <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400" onClick={async () => { if (await globalConfirm(`למחוק את גיול '${r.entity_name}'? פעולה זו אינה ניתנת לביטול.`)) remove(r); }}><Trash2 className="h-3.5 w-3.5" /></Button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {filtered.length > 0 && (
              <tfoot><tr className="border-t-2 border-border bg-background/50 font-bold text-sm">
                <td className="px-3 py-3" /><td className="px-3 py-3 text-foreground" colSpan={2}>סה״כ ({filtered.length} ישויות)</td>
                {BUCKETS.map(b => {
                  const val = filtered.reduce((s, i) => s + Number((i as any)[b.key] || 0), 0);
                  return <td key={b.key} className="px-3 py-3 font-mono text-xs" style={{ color: b.color }}>{fmtC(val)}</td>;
                })}
                <td className="px-3 py-3 font-mono text-foreground">{fmtC(filtered.reduce((s, i) => s + Number(i.total || 0), 0))}</td>
                <td colSpan={3} />
              </tr></tfoot>
            )}
          </table>
        </div>
      </CardContent></Card>
      <SmartPagination pagination={pagination} />

      {viewDetail && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setViewDetail(null)}>
          <div className="bg-card border border-border rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold text-foreground">{viewDetail.entity_name}</h2>
                <Badge className={`${entityTypeMap[viewDetail.entity_type]?.color} border-0`}>{entityTypeMap[viewDetail.entity_type]?.label}</Badge>
                <Badge className={`${riskConfig[getRisk(viewDetail)]?.color} border-0`}>{riskConfig[getRisk(viewDetail)]?.label}</Badge>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setViewDetail(null)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="p-4 space-y-4">
              <div className="bg-input rounded-lg border border-border p-4">
                <p className="text-sm font-semibold text-foreground mb-3">פירוט גיול</p>
                <div className="space-y-3">
                  {BUCKETS.map(b => {
                    const val = Number((viewDetail as any)[b.key] || 0);
                    const pct = Number(viewDetail.total) > 0 ? (val / Number(viewDetail.total)) * 100 : 0;
                    return (
                      <div key={b.key}>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="text-muted-foreground">{b.label}</span>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-muted-foreground">{pct.toFixed(1)}%</span>
                            <span className="font-mono font-bold" style={{ color: b.color }}>{fmtC(val)}</span>
                          </div>
                        </div>
                        <div className="bg-muted rounded-full h-2">
                          <div className="h-2 rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: b.color }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
                  <span className="text-foreground font-semibold">סה״כ חוב</span>
                  <span className="text-xl font-bold font-mono text-foreground">{fmtC(viewDetail.total)}</span>
                </div>
              </div>

              <div className="bg-input rounded-lg p-4">
                <div className="flex h-6 rounded-lg overflow-hidden">
                  {BUCKETS.map(b => {
                    const val = Number((viewDetail as any)[b.key] || 0);
                    const pct = Number(viewDetail.total) > 0 ? (val / Number(viewDetail.total)) * 100 : 0;
                    return pct > 0 ? (
                      <div key={b.key} className="h-full flex items-center justify-center text-[9px] font-bold text-foreground" style={{ width: `${pct}%`, backgroundColor: b.color, minWidth: pct > 5 ? undefined : "0" }}>
                        {pct > 10 ? `${pct.toFixed(0)}%` : ""}
                      </div>
                    ) : null;
                  })}
                </div>
                <div className="flex gap-3 mt-2 flex-wrap">
                  {BUCKETS.map(b => (
                    <div key={b.key} className="flex items-center gap-1 text-[10px]"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: b.color }} /><span className="text-muted-foreground">{b.label}</span></div>
                  ))}
                </div>
              </div>

              {viewDetail.notes && <div className="bg-input rounded-lg p-3"><p className="text-[11px] text-muted-foreground mb-1">הערות</p><p className="text-sm text-foreground">{viewDetail.notes}</p></div>}
            </div>
            <div className="flex items-center gap-2 p-4 border-t border-border justify-end">
              <Button variant="outline" className="border-border gap-1" onClick={() => printPage(`גיול — ${viewDetail.entity_name}`)}><Printer className="h-4 w-4" />הדפסה</Button>
              <Button onClick={() => { openEdit(viewDetail); setViewDetail(null); }} className="bg-blue-600 hover:bg-blue-700 gap-1"><Edit2 className="h-4 w-4" />ערוך</Button>
            </div>
          </div>
        </div>
      )}

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between p-4 border-b border-border">
                <h2 className="text-lg font-bold text-foreground">{editing ? "עריכת גיול" : "רשומת גיול חדשה"}</h2>
                <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}><X className="h-4 w-4" /></Button>
              </div>
              <div className="p-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div><Label className="text-muted-foreground text-xs">שם *</Label><Input value={form.entity_name || ""} onChange={e => setForm({ ...form, entity_name: e.target.value })} className="bg-input border-border text-foreground mt-1" /></div>
                  <div><Label className="text-muted-foreground text-xs">סוג *</Label><select value={form.entity_type || "customer"} onChange={e => setForm({ ...form, entity_type: e.target.value })} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1"><option value="customer">לקוח</option><option value="supplier">ספק</option></select></div>
                </div>
                <div className="border-b border-border pb-2"><h3 className="text-sm font-semibold text-blue-400">סכומים לפי טווח</h3></div>
                <div className="grid grid-cols-2 gap-3">
                  {BUCKETS.map(b => (
                    <div key={b.key}><Label className="text-xs" style={{ color: b.color }}>{b.label} (₪)</Label><Input type="number" min={0} value={(form as any)[b.key] ?? ""} onChange={e => setForm({ ...form, [b.key]: Number(e.target.value) || 0 })} className="bg-input border-border text-foreground mt-1 font-mono" /></div>
                  ))}
                </div>
                <div className="bg-input rounded-lg p-3 border border-border flex justify-between items-center">
                  <span className="text-muted-foreground text-sm">סה״כ חוב</span>
                  <span className="text-lg font-bold font-mono text-foreground">{fmtC(BUCKETS.reduce((s, b) => s + (Number((form as any)[b.key]) || 0), 0))}</span>
                </div>
                <div><Label className="text-muted-foreground text-xs">הערות</Label><textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1 resize-none" /></div>
              </div>
              <div className="flex items-center gap-2 p-4 border-t border-border justify-end">
                <Button variant="outline" onClick={() => setShowForm(false)} className="border-border">ביטול</Button>
                <Button onClick={save} disabled={saving || !form.entity_name} className="bg-cyan-600 hover:bg-cyan-700 gap-1"><Save className="h-4 w-4" />{saving ? "שומר..." : editing ? "עדכן" : "שמור"}</Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
