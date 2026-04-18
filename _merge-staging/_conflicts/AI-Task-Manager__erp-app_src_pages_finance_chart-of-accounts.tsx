import { useState, useEffect, useMemo, Fragment } from "react";
import {
  BookOpen, Search, Plus, Edit2, Trash2, X, Save, Eye,
  ChevronLeft, ChevronDown, Loader2, ArrowUpDown,
  Printer, Building2, TrendingUp, TrendingDown, Wallet, Landmark,
  FolderTree, Layers, BarChart3, Copy
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from "recharts";
import ExportDropdown from "@/components/export-dropdown";
import { globalConfirm } from "@/components/confirm-dialog";
import { printPage } from "@/lib/print-utils";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { authFetch } from "@/lib/utils";
import { usePermissions } from "@/hooks/use-permissions";
import { duplicateRecord } from "@/lib/duplicate-record";
import BulkActions, { useBulkSelection, defaultBulkActions } from "@/components/bulk-actions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInt = (v: any) => Number(v || 0).toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

interface Account {
  id: number; account_number: string; account_name: string; account_name_en: string;
  account_type: string; account_subtype: string;
  parent_account_id: number | null; parent_account_number: string;
  hierarchy_level: number; hierarchy_path: string;
  is_group: boolean; is_system_account: boolean; currency: string; status: string;
  opening_balance: number; current_balance: number; debit_total: number; credit_total: number;
  normal_balance: string; tax_category: string; tax_rate: number;
  cost_center: string; department: string; description: string; notes: string;
  allow_direct_posting: boolean; sort_order: number;
  children?: Account[];
}

const typeConfig: Record<string, { label: string; color: string; icon: any; bg: string }> = {
  asset: { label: "נכסים", color: "text-blue-400", icon: Building2, bg: "from-blue-500/15 to-blue-600/5 border-blue-500/20" },
  liability: { label: "התחייבויות", color: "text-red-400", icon: TrendingDown, bg: "from-red-500/15 to-red-600/5 border-red-500/20" },
  equity: { label: "הון עצמי", color: "text-purple-400", icon: Landmark, bg: "from-purple-500/15 to-purple-600/5 border-purple-500/20" },
  revenue: { label: "הכנסות", color: "text-emerald-400", icon: TrendingUp, bg: "from-emerald-500/15 to-emerald-600/5 border-emerald-500/20" },
  expense: { label: "הוצאות", color: "text-amber-400", icon: Wallet, bg: "from-amber-500/15 to-amber-600/5 border-amber-500/20" },
  contra_asset: { label: "נגדי נכסים", color: "text-blue-300", icon: Building2, bg: "from-blue-500/10 to-blue-600/5 border-blue-500/15" },
  contra_liability: { label: "נגדי התחייבויות", color: "text-red-300", icon: TrendingDown, bg: "from-red-500/10 to-red-600/5 border-red-500/15" },
  contra_equity: { label: "נגדי הון", color: "text-purple-300", icon: Landmark, bg: "from-purple-500/10 to-purple-600/5 border-purple-500/15" },
  contra_revenue: { label: "נגדי הכנסות", color: "text-emerald-300", icon: TrendingUp, bg: "from-emerald-500/10 to-emerald-600/5 border-emerald-500/15" },
};
const statusConfig: Record<string, { label: string; color: string }> = {
  active: { label: "פעיל", color: "bg-green-500/20 text-green-300" },
  inactive: { label: "לא פעיל", color: "bg-amber-500/20 text-amber-300" },
  closed: { label: "סגור", color: "bg-red-500/20 text-red-300" },
};
const PIE_COLORS = ["#3b82f6", "#ef4444", "#8b5cf6", "#10b981", "#f59e0b"];

export default function ChartOfAccountsPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<Account[]>([]);
  const [tree, setTree] = useState<Account[]>([]);
  const [stats, setStats] = useState<any>({});
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [viewMode, setViewMode] = useState<"tree" | "flat">("tree");
  const [sortField, setSortField] = useState("account_number");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [form, setForm] = useState<any>({});
  const [tableLoading, setTableLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<Account | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const pagination = useSmartPagination(50);
  const { selectedIds, setSelectedIds, toggle, toggleAll, isSelected } = useBulkSelection();
  const token = localStorage.getItem("token") || "";
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const load = () => {
    setTableLoading(true);
    Promise.all([
      authFetch(`${API}/chart-of-accounts`, { headers }).then(r => r.json()).then(d => setItems(safeArray(d))),
      authFetch(`${API}/chart-of-accounts/tree`, { headers }).then(r => r.json()).then(d => setTree(safeArray(d))).catch(() => {}),
      authFetch(`${API}/chart-of-accounts/stats`, { headers }).then(r => r.json()).then(d => setStats(d || {})).catch(() => {}),
    ]).finally(() => setTableLoading(false));
  };
  useEffect(load, []);

  const filtered = useMemo(() => {
    let f = items.filter(i =>
      (filterType === "all" || i.account_type === filterType) &&
      (filterStatus === "all" || i.status === filterStatus) &&
      (!search || i.account_number?.includes(search) || i.account_name?.includes(search) || i.account_name_en?.toLowerCase().includes(search.toLowerCase()) || i.description?.includes(search))
    );
    f.sort((a: any, b: any) => { const av = a[sortField], bv = b[sortField]; const cmp = typeof av === "number" ? av - bv : String(av || "").localeCompare(String(bv || "")); return sortDir === "asc" ? cmp : -cmp; });
    return f;
  }, [items, search, filterType, filterStatus, sortField, sortDir]);

  const openCreate = (parentId?: number) => {
    setEditing(null);
    const parent = parentId ? items.find(i => i.id === parentId) : null;
    setForm({ accountType: parent?.account_type || "expense", status: "active", currency: "ILS", isGroup: false, allowDirectPosting: true, parentAccountId: parentId || "", parentAccountNumber: parent?.account_number || "", openingBalance: 0, sortOrder: 0 });
    setShowForm(true);
  };

  const openEdit = (r: Account) => {
    setEditing(r);
    setForm({
      accountNumber: r.account_number, accountName: r.account_name, accountNameEn: r.account_name_en,
      accountType: r.account_type, accountSubtype: r.account_subtype,
      parentAccountId: r.parent_account_id || "", parentAccountNumber: r.parent_account_number || "",
      isGroup: r.is_group, currency: r.currency, status: r.status,
      openingBalance: r.opening_balance, currentBalance: r.current_balance,
      taxCategory: r.tax_category, taxRate: r.tax_rate,
      costCenter: r.cost_center, department: r.department,
      allowDirectPosting: r.allow_direct_posting, sortOrder: r.sort_order,
      description: r.description, notes: r.notes,
    });
    setShowForm(true);
  };

  const save = async () => {
    if (!form.accountNumber || !form.accountName) return;
    setSaving(true);
    const url = editing ? `${API}/chart-of-accounts/${editing.id}` : `${API}/chart-of-accounts`;
    try {
      await authFetch(url, { method: editing ? "PUT" : "POST", headers, body: JSON.stringify(form) });
      setShowForm(false); load();
    } catch {}
    setSaving(false);
  };

  const remove = async (id: number) => {
    await authFetch(`${API}/chart-of-accounts/${id}`, { method: "DELETE", headers });
    load();
  };

  const toggleExpand = (id: number) => {
    setExpandedNodes(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };
  const expandAll = () => {
    const allIds = new Set<number>();
    const collect = (nodes: Account[]) => { nodes.forEach(n => { if (n.children && n.children.length > 0) { allIds.add(n.id); collect(n.children); } }); };
    collect(tree); setExpandedNodes(allIds);
  };
  const collapseAll = () => setExpandedNodes(new Set());

  const toggleSort = (f: string) => { if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField(f); setSortDir("asc"); } };
  const af = [filterType !== "all", filterStatus !== "all"].filter(Boolean).length;

  const kpis = [
    { label: "סה״כ חשבונות", value: fmtInt(stats.total || items.length), icon: BookOpen, color: "text-blue-400", bg: "from-blue-500/15 to-blue-600/5 border-blue-500/20" },
    { label: "נכסים", value: `₪${fmtInt(stats.total_assets || 0)}`, sub: `${fmtInt(stats.assets || 0)} חשבונות`, icon: Building2, color: "text-blue-400", bg: "from-blue-500/15 to-blue-600/5 border-blue-500/20" },
    { label: "התחייבויות", value: `₪${fmtInt(stats.total_liabilities || 0)}`, sub: `${fmtInt(stats.liabilities || 0)} חשבונות`, icon: TrendingDown, color: "text-red-400", bg: "from-red-500/15 to-red-600/5 border-red-500/20" },
    { label: "הכנסות", value: `₪${fmtInt(stats.total_revenue || 0)}`, sub: `${fmtInt(stats.revenues || 0)} חשבונות`, icon: TrendingUp, color: "text-emerald-400", bg: "from-emerald-500/15 to-emerald-600/5 border-emerald-500/20" },
    { label: "הוצאות", value: `₪${fmtInt(stats.total_expenses || 0)}`, sub: `${fmtInt(stats.expenses || 0)} חשבונות`, icon: Wallet, color: "text-amber-400", bg: "from-amber-500/15 to-amber-600/5 border-amber-500/20" },
    { label: "הון עצמי", value: fmtInt(stats.equity || 0), sub: "חשבונות", icon: Landmark, color: "text-purple-400", bg: "from-purple-500/15 to-purple-600/5 border-purple-500/20" },
  ];

  const pieData = useMemo(() => {
    const types = ["asset", "liability", "equity", "revenue", "expense"];
    return types.map(t => ({
      name: typeConfig[t]?.label || t,
      value: items.filter(i => i.account_type === t).length,
    })).filter(d => d.value > 0);
  }, [items]);

  const balanceByType = useMemo(() => {
    const types = ["asset", "liability", "equity", "revenue", "expense"];
    return types.map(t => ({
      type: typeConfig[t]?.label || t,
      balance: Math.abs(items.filter(i => i.account_type === t).reduce((s, i) => s + (Number(i.current_balance) || 0), 0)),
    })).filter(d => d.balance > 0);
  }, [items]);

  const renderTreeNode = (node: Account, depth: number = 0): JSX.Element => {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedNodes.has(node.id);
    const tc = typeConfig[node.account_type];
    const bal = Number(node.current_balance) || 0;

    if (search && !node.account_number?.includes(search) && !node.account_name?.includes(search)) {
      if (!hasChildren) return <Fragment key={node.id} />;
      const matchingChildren = node.children?.filter(c => c.account_number?.includes(search) || c.account_name?.includes(search));
      if (!matchingChildren?.length) return <Fragment key={node.id} />;
    }

    return (
      <Fragment key={node.id}>
        <tr className="border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => setSelectedItem(node)}>
          <td className="px-3 py-2.5" style={{ paddingRight: `${12 + depth * 24}px` }}>
            <div className="flex items-center gap-2">
              {hasChildren ? (
                <button onClick={e => { e.stopPropagation(); toggleExpand(node.id); }} className="text-muted-foreground hover:text-foreground p-0.5">
                  {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
                </button>
              ) : <span className="w-4" />}
              <span className="font-mono text-xs text-cyan-400 font-bold">{node.account_number}</span>
              {node.is_group && <Badge className="bg-purple-500/20 text-purple-300 border-0 text-[9px] px-1">קבוצה</Badge>}
            </div>
          </td>
          <td className="px-3 py-2.5 text-foreground text-sm font-medium">{node.account_name}</td>
          <td className="px-3 py-2.5"><span className={`text-xs ${tc?.color || "text-muted-foreground"}`}>{tc?.label || node.account_type}</span></td>
          <td className="px-3 py-2.5 font-mono text-xs"><span className={bal > 0 ? "text-emerald-400" : bal < 0 ? "text-red-400" : "text-muted-foreground"}>₪{fmt(bal)}</span></td>
          <td className="px-3 py-2.5"><Badge className={`${statusConfig[node.status]?.color || "bg-muted"} border-0 text-[10px]`}>{statusConfig[node.status]?.label || node.status}</Badge></td>
          <td className="px-3 py-2.5 text-center" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-center gap-1">
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" onClick={() => setSelectedItem(node)}><Eye className="h-3.5 w-3.5" /></Button>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-blue-400" onClick={() => openEdit(node)}><Edit2 className="h-3.5 w-3.5" /></Button>
                    <Button title="שכפול" variant="ghost" size="sm" className="p-1 hover:bg-muted rounded text-muted-foreground" onClick={async () => { const res = await duplicateRecord(`${API}/chart-of-accounts`, node.id); if (res.ok) { load(); } else { alert("שגיאה בשכפול: " + res.error); } }}><Copy className="w-3.5 h-3.5" /></Button>
              {!hasChildren && isSuperAdmin && <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400" onClick={async () => { if (await globalConfirm(`למחוק את חשבון '${node.account_number} — ${node.account_name}'? פעולה זו אינה ניתנת לביטול.`)) remove(node.id); }}><Trash2 className="h-3.5 w-3.5" /></Button>}
              {node.is_group && <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-green-400" onClick={() => openCreate(node.id)} title="הוסף חשבון בן"><Plus className="h-3.5 w-3.5" /></Button>}
            </div>
          </td>
        </tr>
        {hasChildren && isExpanded && node.children!.map(child => renderTreeNode(child, depth + 1))}
      </Fragment>
    );
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><FolderTree className="text-cyan-400" /> עץ חשבונות</h1>
          <p className="text-sm text-muted-foreground mt-1">תכנית חשבונות היררכית — נכסים, התחייבויות, הון, הכנסות, הוצאות</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportDropdown data={items} headers={{ account_number: "קוד", account_name: "שם", account_type: "סוג", current_balance: "יתרה", status: "סטטוס" }} filename="chart_of_accounts" />
          <Button variant="outline" onClick={() => printPage("עץ חשבונות")} className="border-border text-muted-foreground gap-1"><Printer className="h-4 w-4" />הדפסה</Button>
          <Button onClick={() => openCreate()} className="bg-cyan-600 hover:bg-cyan-700 gap-1"><Plus className="h-4 w-4" />חשבון חדש</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((kpi, i) => (
          <Card key={i} className={`bg-gradient-to-br ${kpi.bg}`}>
            <CardContent className="p-4">
              <kpi.icon className={`${kpi.color} mb-1.5 h-5 w-5`} />
              <p className={`text-lg font-bold font-mono ${kpi.color}`}>{kpi.value}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{kpi.label}</p>
              {(kpi as any).sub && <p className="text-[10px] text-muted-foreground/60">{(kpi as any).sub}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      {(pieData.length > 1 || balanceByType.length > 1) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {pieData.length > 1 && (
            <Card className="bg-card/80 border-border"><CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-foreground"><Layers className="h-4 w-4 text-cyan-400" /> חלוקת חשבונות לפי סוג</div>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                    {pieData.map((_e, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-3 mt-2 justify-center">{pieData.map((p, i) => <span key={i} className="text-[10px] text-muted-foreground flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />{p.name} ({p.value})</span>)}</div>
            </CardContent></Card>
          )}
          {balanceByType.length > 1 && (
            <Card className="bg-card/80 border-border"><CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-foreground"><BarChart3 className="h-4 w-4 text-emerald-400" /> יתרות לפי סוג חשבון</div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={balanceByType} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3e" />
                  <XAxis type="number" tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`} tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={{ stroke: "#2a2a3e" }} />
                  <YAxis type="category" dataKey="type" tick={{ fill: "#e5e7eb", fontSize: 11 }} axisLine={{ stroke: "#2a2a3e" }} width={80} />
                  <Tooltip formatter={(v: number) => `₪${fmt(v)}`} contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                  <Bar dataKey="balance" radius={[0, 4, 4, 0]}>
                    {balanceByType.map((_e, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent></Card>
          )}
        </div>
      )}

      <Card className="bg-card/60 border-border"><CardContent className="p-3"><div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]"><Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={e => { setSearch(e.target.value); pagination.setPage(1); }} placeholder="חיפוש לפי קוד חשבון, שם..." className="pr-9 bg-input border-border text-foreground" /></div>
        <select value={filterType} onChange={e => { setFilterType(e.target.value); pagination.setPage(1); }} className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground"><option value="all">כל הסוגים</option>{Object.entries(typeConfig).slice(0, 5).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); pagination.setPage(1); }} className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground"><option value="all">כל הסטטוסים</option>{Object.entries(statusConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        <div className="flex bg-input border border-border rounded-md overflow-hidden">
          <button onClick={() => setViewMode("tree")} className={`px-3 py-2 text-xs ${viewMode === "tree" ? "bg-cyan-600 text-foreground" : "text-muted-foreground hover:text-foreground"}`}>עץ</button>
          <button onClick={() => setViewMode("flat")} className={`px-3 py-2 text-xs ${viewMode === "flat" ? "bg-cyan-600 text-foreground" : "text-muted-foreground hover:text-foreground"}`}>שטוח</button>
        </div>
        {viewMode === "tree" && <>
          <Button variant="ghost" size="sm" onClick={expandAll} className="text-blue-400 text-xs">פתח הכל</Button>
          <Button variant="ghost" size="sm" onClick={collapseAll} className="text-muted-foreground text-xs">סגור הכל</Button>
        </>}
        {af > 0 && <Button variant="ghost" size="sm" onClick={() => { setFilterType("all"); setFilterStatus("all"); setSearch(""); }} className="text-red-400 hover:text-red-300 gap-1"><X className="h-3 w-3" />נקה</Button>}
      </div></CardContent></Card>

      {viewMode === "flat" && (
        <BulkActions items={filtered} selectedIds={selectedIds} onSelectionChange={setSelectedIds} actions={[
          defaultBulkActions.delete(async (ids) => { await Promise.allSettled(ids.map(id => authFetch(`${API}/chart-of-accounts/${id}`, { method: "DELETE", headers }))); load(); }),
          defaultBulkActions.export(async (ids) => { const sel = filtered.filter(i => ids.includes(String(i.id))); const csv = "קוד,שם,סוג,יתרה,סטטוס\n" + sel.map(i => `${i.account_number},${i.account_name},${typeConfig[i.account_type]?.label || i.account_type},${i.current_balance},${statusConfig[i.status]?.label || i.status}`).join("\n"); const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "chart_of_accounts.csv"; a.click(); }),
        ]} />
      )}

      <Card className="bg-card/80 border-border"><CardContent className="p-0">
        <div className="overflow-x-auto relative">
          {tableLoading && <div className="absolute inset-0 bg-background/60 backdrop-blur-[1px] flex items-center justify-center z-10"><div className="flex items-center gap-2 bg-card border border-border rounded-lg px-4 py-2 shadow-lg"><Loader2 className="w-4 h-4 animate-spin text-cyan-400" /><span className="text-sm text-foreground">טוען עץ חשבונות...</span></div></div>}
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border bg-background/50">
              {viewMode === "flat" && <th className="px-3 py-3 w-10"><input type="checkbox" className="rounded" onChange={() => toggleAll(filtered)} /></th>}
              {[{ key: "account_number", label: "קוד חשבון" }, { key: "account_name", label: "שם חשבון" }, { key: "account_type", label: "סוג" }, { key: "current_balance", label: "יתרה" }, { key: "status", label: "סטטוס" }].map(col => (
                <th key={col.key} className="px-3 py-3 text-right text-muted-foreground font-medium cursor-pointer hover:text-foreground" onClick={() => viewMode === "flat" && toggleSort(col.key)}><div className="flex items-center gap-1 text-xs">{col.label}{viewMode === "flat" && <ArrowUpDown className="h-3 w-3" />}</div></th>
              ))}
              <th className="px-3 py-3 text-center text-muted-foreground font-medium text-xs">פעולות</th>
            </tr></thead>
            <tbody>
              {!tableLoading && viewMode === "tree" && tree.length === 0 && filtered.length === 0 ? (
                <tr><td colSpan={7} className="p-16 text-center"><div className="flex flex-col items-center gap-4"><FolderTree className="h-12 w-12 text-muted-foreground" /><p className="text-lg font-medium text-muted-foreground">עדיין אין חשבונות בעץ</p><p className="text-sm text-muted-foreground/60">צור חשבון ראשון</p><Button onClick={() => openCreate()} className="bg-cyan-600 hover:bg-cyan-700 gap-2 mt-2"><Plus className="h-4 w-4" />חשבון חדש</Button></div></td></tr>
              ) : viewMode === "tree" ? (
                tree.length > 0 ? tree.map(node => renderTreeNode(node)) : filtered.map(r => renderTreeNode(r))
              ) : (
                pagination.paginate(filtered).length === 0 ? (
                  <tr><td colSpan={7} className="p-16 text-center"><div className="flex flex-col items-center gap-4"><Search className="h-12 w-12 text-muted-foreground" /><p className="text-lg font-medium text-muted-foreground">לא נמצאו תוצאות</p></div></td></tr>
                ) : pagination.paginate(filtered).map(r => {
                  const tc = typeConfig[r.account_type];
                  const bal = Number(r.current_balance) || 0;
                  return (
                    <tr key={r.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => setSelectedItem(r)}>
                      <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}><input type="checkbox" checked={isSelected(String(r.id))} onChange={() => toggle(String(r.id))} className="rounded" /></td>
                      <td className="px-3 py-2.5"><div className="flex items-center gap-2"><span className="font-mono text-xs text-cyan-400 font-bold">{r.account_number}</span>{r.is_group && <Badge className="bg-purple-500/20 text-purple-300 border-0 text-[9px] px-1">קבוצה</Badge>}</div></td>
                      <td className="px-3 py-2.5 text-foreground text-sm font-medium">{r.account_name}</td>
                      <td className="px-3 py-2.5"><span className={`text-xs ${tc?.color || "text-muted-foreground"}`}>{tc?.label || r.account_type}</span></td>
                      <td className="px-3 py-2.5 font-mono text-xs"><span className={bal > 0 ? "text-emerald-400" : bal < 0 ? "text-red-400" : "text-muted-foreground"}>₪{fmt(bal)}</span></td>
                      <td className="px-3 py-2.5"><Badge className={`${statusConfig[r.status]?.color || "bg-muted"} border-0 text-[10px]`}>{statusConfig[r.status]?.label || r.status}</Badge></td>
                      <td className="px-3 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" onClick={() => setSelectedItem(r)}><Eye className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-blue-400" onClick={() => openEdit(r)}><Edit2 className="h-3.5 w-3.5" /></Button>
                    <Button title="שכפול" variant="ghost" size="sm" className="p-1 hover:bg-muted rounded text-muted-foreground" onClick={async () => { const res = await duplicateRecord(`${API}/chart-of-accounts`, r.id); if (res.ok) { load(); } else { alert("שגיאה בשכפול: " + res.error); } }}><Copy className="w-3.5 h-3.5" /></Button>
                          {isSuperAdmin && <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400" onClick={async () => { if (await globalConfirm(`למחוק את חשבון '${r.account_number} — ${r.account_name}'? פעולה זו אינה ניתנת לביטול.`)) remove(r.id); }}><Trash2 className="h-3.5 w-3.5" /></Button>}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </CardContent></Card>
      {viewMode === "flat" && <SmartPagination pagination={pagination} />}

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between p-4 border-b border-border">
                <h2 className="text-lg font-bold text-foreground">{editing ? "עריכת חשבון" : "חשבון חדש"}</h2>
                <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}><X className="h-4 w-4" /></Button>
              </div>
              <div className="p-4 space-y-5">
                <div className="border-b border-border pb-2"><h3 className="text-sm font-semibold text-cyan-400">פרטי חשבון</h3></div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div><Label className="text-muted-foreground text-xs">קוד חשבון *</Label><Input value={form.accountNumber || ""} onChange={e => setForm({ ...form, accountNumber: e.target.value })} placeholder="1000" className="bg-input border-border text-foreground mt-1 font-mono" disabled={!!editing} /></div>
                  <div className="col-span-2"><Label className="text-muted-foreground text-xs">שם חשבון *</Label><Input value={form.accountName || ""} onChange={e => setForm({ ...form, accountName: e.target.value })} placeholder="שם חשבון..." className="bg-input border-border text-foreground mt-1" /></div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><Label className="text-muted-foreground text-xs">סוג חשבון *</Label><select value={form.accountType || "expense"} onChange={e => setForm({ ...form, accountType: e.target.value })} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">{Object.entries(typeConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
                  <div><Label className="text-muted-foreground text-xs">סטטוס</Label><select value={form.status || "active"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">{Object.entries(statusConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
                  <div><Label className="text-muted-foreground text-xs">מטבע</Label><select value={form.currency || "ILS"} onChange={e => setForm({ ...form, currency: e.target.value })} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1"><option value="ILS">₪ ILS</option><option value="USD">$ USD</option><option value="EUR">€ EUR</option></select></div>
                  <div className="flex items-end gap-3 pb-1">
                    <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer"><input type="checkbox" checked={form.isGroup || false} onChange={e => setForm({ ...form, isGroup: e.target.checked })} className="rounded" />חשבון קבוצה</label>
                  </div>
                </div>

                <div className="border-b border-border pb-2"><h3 className="text-sm font-semibold text-cyan-400">היררכיה</h3></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label className="text-muted-foreground text-xs">חשבון אב</Label><select value={form.parentAccountId || ""} onChange={e => { const pid = e.target.value; const parent = items.find(i => i.id === Number(pid)); setForm({ ...form, parentAccountId: pid, parentAccountNumber: parent?.account_number || "" }); }} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1"><option value="">ללא (שורש)</option>{items.filter(i => i.is_group && (!editing || i.id !== editing.id)).map(a => <option key={a.id} value={a.id}>{a.account_number} — {a.account_name}</option>)}</select></div>
                  <div><Label className="text-muted-foreground text-xs">יתרת פתיחה (₪)</Label><Input type="number" step={0.01} value={form.openingBalance || ""} onChange={e => setForm({ ...form, openingBalance: e.target.value })} className="bg-input border-border text-foreground mt-1 font-mono" /></div>
                </div>

                <div className="border-b border-border pb-2"><h3 className="text-sm font-semibold text-cyan-400">מיסוי ומרכזי עלות</h3></div>
                <div className="grid grid-cols-3 gap-4">
                  <div><Label className="text-muted-foreground text-xs">קטגוריית מס</Label><Input value={form.taxCategory || ""} onChange={e => setForm({ ...form, taxCategory: e.target.value })} className="bg-input border-border text-foreground mt-1" /></div>
                  <div><Label className="text-muted-foreground text-xs">שיעור מס (%)</Label><Input type="number" step={0.01} value={form.taxRate || ""} onChange={e => setForm({ ...form, taxRate: e.target.value })} className="bg-input border-border text-foreground mt-1 font-mono" /></div>
                  <div><Label className="text-muted-foreground text-xs">מרכז עלות</Label><Input value={form.costCenter || ""} onChange={e => setForm({ ...form, costCenter: e.target.value })} className="bg-input border-border text-foreground mt-1" /></div>
                </div>

                <div className="border-b border-border pb-2"><h3 className="text-sm font-semibold text-cyan-400">תיאור</h3></div>
                <textarea value={form.description || ""} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground resize-none" placeholder="תיאור החשבון..." />
                <textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground resize-none" placeholder="הערות..." />
              </div>
              <div className="flex items-center gap-2 p-4 border-t border-border justify-end">
                <Button variant="outline" onClick={() => setShowForm(false)} className="border-border">ביטול</Button>
                <Button onClick={save} disabled={saving || !form.accountNumber || !form.accountName} className="bg-cyan-600 hover:bg-cyan-700 gap-1"><Save className="h-4 w-4" />{saving ? "שומר..." : editing ? "עדכן" : "שמור"}</Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {selectedItem && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setSelectedItem(null)}>
          <div className="bg-card border border-border rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold text-foreground font-mono">{selectedItem.account_number}</h2>
                <h3 className="text-foreground font-medium">{selectedItem.account_name}</h3>
                <Badge className={`${statusConfig[selectedItem.status]?.color || "bg-muted"} border-0`}>{statusConfig[selectedItem.status]?.label || selectedItem.status}</Badge>
                {selectedItem.is_group && <Badge className="bg-purple-500/20 text-purple-300 border-0 text-xs">קבוצה</Badge>}
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedItem(null)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {[
                  { l: "סוג חשבון", v: typeConfig[selectedItem.account_type]?.label || selectedItem.account_type, c: typeConfig[selectedItem.account_type]?.color },
                  { l: "מטבע", v: selectedItem.currency || "ILS" },
                  { l: "יתרה נורמלית", v: selectedItem.normal_balance === "debit" ? "חיוב" : "זיכוי" },
                  { l: "חשבון אב", v: selectedItem.parent_account_number ? `${selectedItem.parent_account_number}` : "שורש" },
                  { l: "רמת היררכיה", v: String(selectedItem.hierarchy_level || 1) },
                  { l: "נתיב", v: selectedItem.hierarchy_path || selectedItem.account_number },
                ].map((d, i) => (
                  <div key={i} className="bg-input rounded-lg p-3"><p className="text-[11px] text-muted-foreground">{d.l}</p><p className={`mt-1 font-medium text-sm ${(d as any).c || "text-foreground"}`}>{d.v}</p></div>
                ))}
              </div>

              <div className="bg-input rounded-lg border border-border p-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                  <div><p className="text-[11px] text-muted-foreground mb-1">יתרת פתיחה</p><p className="text-lg font-bold font-mono text-foreground">₪{fmt(selectedItem.opening_balance)}</p></div>
                  <div><p className="text-[11px] text-muted-foreground mb-1">סה״כ חיוב</p><p className="text-lg font-bold font-mono text-emerald-400">₪{fmt(selectedItem.debit_total)}</p></div>
                  <div><p className="text-[11px] text-muted-foreground mb-1">סה״כ זיכוי</p><p className="text-lg font-bold font-mono text-red-400">₪{fmt(selectedItem.credit_total)}</p></div>
                  <div><p className="text-[11px] text-muted-foreground mb-1">יתרה נוכחית</p><p className={`text-lg font-bold font-mono ${Number(selectedItem.current_balance) >= 0 ? "text-cyan-400" : "text-red-400"}`}>₪{fmt(selectedItem.current_balance)}</p></div>
                </div>
              </div>

              {(selectedItem.tax_category || selectedItem.cost_center || selectedItem.department) && (
                <div className="grid grid-cols-3 gap-3">
                  {selectedItem.tax_category && <div className="bg-input rounded-lg p-3"><p className="text-[11px] text-muted-foreground">קטגוריית מס</p><p className="text-foreground mt-1 text-sm">{selectedItem.tax_category}</p></div>}
                  {selectedItem.cost_center && <div className="bg-input rounded-lg p-3"><p className="text-[11px] text-muted-foreground">מרכז עלות</p><p className="text-foreground mt-1 text-sm">{selectedItem.cost_center}</p></div>}
                  {selectedItem.department && <div className="bg-input rounded-lg p-3"><p className="text-[11px] text-muted-foreground">מחלקה</p><p className="text-foreground mt-1 text-sm">{selectedItem.department}</p></div>}
                </div>
              )}

              {selectedItem.description && <div className="bg-input rounded-lg p-3"><p className="text-[11px] text-muted-foreground mb-1">תיאור</p><p className="text-sm text-foreground">{selectedItem.description}</p></div>}
              {selectedItem.notes && <div className="bg-input rounded-lg p-3"><p className="text-[11px] text-muted-foreground mb-1">הערות</p><p className="text-sm text-foreground">{selectedItem.notes}</p></div>}
            </div>
            <div className="flex items-center gap-2 p-4 border-t border-border justify-end">
              <Button variant="outline" className="border-border gap-1" onClick={() => printPage(`חשבון ${selectedItem.account_number}`)}><Printer className="h-4 w-4" />הדפסה</Button>
              <Button onClick={() => { openEdit(selectedItem); setSelectedItem(null); }} className="bg-cyan-600 hover:bg-cyan-700 gap-1"><Edit2 className="h-4 w-4" />ערוך</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
