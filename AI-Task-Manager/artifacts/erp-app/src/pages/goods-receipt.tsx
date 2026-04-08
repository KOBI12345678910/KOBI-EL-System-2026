import { useState, useEffect, useMemo, useCallback } from "react";
import { authFetch } from "@/lib/utils";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import ExportDropdown from "@/components/export-dropdown";
import { translateStatus } from "@/lib/status-labels";
import { Search, Plus, Edit2, Trash2, ArrowUpDown, X, Save, Loader2, PackageCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";

const API = "/api";
const PAGE_SIZE = 25;
const INPUT_CLS = "w-full rounded-lg border border-border bg-input px-3 py-2 text-foreground focus:ring-2 focus:ring-ring/50 focus:border-ring transition-colors";
const FIELD = (props: { label: string; children: React.ReactNode }) => (<div><label className="block text-sm font-medium text-muted-foreground mb-1">{props.label}</label>{props.children}</div>);
const STATUS_COLORS: Record<string, string> = { pending: "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400", received: "bg-green-500/20 text-green-600 dark:text-green-400", partial: "bg-blue-500/20 text-blue-600 dark:text-blue-400", rejected: "bg-red-500/20 text-red-600 dark:text-red-400" };

export default function GoodsReceiptsPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<any>({});
  const [editId, setEditId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortField, setSortField] = useState<string>("receipt_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);

  useEffect(() => { const t = setTimeout(() => setDebouncedSearch(search), 300); return () => clearTimeout(t); }, [search]);

  const load = useCallback(async () => {
    try { setLoading(true); setError(null);
      const res = await authFetch(`${API}/goods-receipts`);
      if (res.ok) { const data = await res.json(); setItems(Array.isArray(data) ? data : data.data || data.items || []); }
      else setError("\u05E9\u05D2\u05D9\u05D0\u05D4 \u05D1\u05D8\u05E2\u05D9\u05E0\u05EA \u05E0\u05EA\u05D5\u05E0\u05D9\u05DD");
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const method = editId ? "PUT" : "POST";
      const url = editId ? `${API}/goods-receipts/${editId}` : `${API}/goods-receipts`;
      const res = await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "\u05E9\u05D2\u05D9\u05D0\u05D4 \u05D1\u05E9\u05DE\u05D9\u05E8\u05D4"); }
      toast({ title: editId ? "\u05E7\u05D1\u05DC\u05D4 \u05E2\u05D5\u05D3\u05DB\u05E0\u05D4 \u05D1\u05D4\u05E6\u05DC\u05D7\u05D4" : "\u05E7\u05D1\u05DC\u05D4 \u05E0\u05D5\u05E1\u05E4\u05D4 \u05D1\u05D4\u05E6\u05DC\u05D7\u05D4", description: form.receipt_number || "" });
      setForm({}); setEditId(null); setShowForm(false); await load();
    } catch (e: any) { toast({ title: "\u05E9\u05D2\u05D9\u05D0\u05D4", description: e.message, variant: "destructive" }); }
    setSaving(false);
  };

  const remove = async (id: number, num: string) => {
    if (!await globalConfirm(`\u05D4\u05D0\u05DD \u05DC\u05DE\u05D7\u05D5\u05E7 \u05D0\u05EA \u05E7\u05D1\u05DC\u05D4 "${num}"?`)) return;
    try { const res = await authFetch(`${API}/goods-receipts/${id}`, { method: "DELETE" }); if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "\u05E9\u05D2\u05D9\u05D0\u05D4"); toast({ title: "\u05E7\u05D1\u05DC\u05D4 \u05E0\u05DE\u05D7\u05E7\u05D4", description: num }); load(); }
    catch (e: any) { toast({ title: "\u05E9\u05D2\u05D9\u05D0\u05D4", description: e.message, variant: "destructive" }); }
  };

  const toggleSort = (field: string) => { if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField(field); setSortDir("asc"); } };

  const filtered = useMemo(() => {
    let d = [...items];
    if (debouncedSearch) { const s = debouncedSearch.toLowerCase(); d = d.filter(r => r.receipt_number?.toLowerCase().includes(s) || r.notes?.toLowerCase().includes(s)); }
    if (statusFilter !== "all") d = d.filter(r => r.status === statusFilter);
    if (sortField) d.sort((a, b) => { const av = a[sortField] ?? ""; const bv = b[sortField] ?? ""; const cmp = typeof av === "number" ? av - bv : String(av).localeCompare(String(bv), "he"); return sortDir === "asc" ? cmp : -cmp; });
    return d;
  }, [items, debouncedSearch, statusFilter, sortField, sortDir]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageData = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => { setPage(1); }, [debouncedSearch, statusFilter]);
  useEffect(() => { if (page > 1 && page > totalPages) setPage(Math.max(1, totalPages)); }, [totalPages]);

  const SortHeader = ({ field, label }: { field: string; label: string }) => (
    <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort(field)}>
      <span className="inline-flex items-center gap-1">{label}<ArrowUpDown className="w-3 h-3 opacity-40" /></span>
    </th>
  );

  const fmtDate = (d: string) => { try { return new Date(d).toLocaleDateString("he-IL"); } catch { return d; } };

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="text-2xl font-bold text-foreground">{'\u05E7\u05D1\u05DC\u05EA \u05E1\u05D7\u05D5\u05E8\u05D4'}</h1><p className="text-sm text-muted-foreground mt-1">{items.length} {'\u05E7\u05D1\u05DC\u05D5\u05EA'}</p></div>
        <div className="flex items-center gap-2">
          <ExportDropdown data={filtered} headers={{ receipt_number: "\u05DE\u05E1\u05E4\u05E8 \u05E7\u05D1\u05DC\u05D4", receipt_date: "\u05EA\u05D0\u05E8\u05D9\u05DA", status: "\u05E1\u05D8\u05D8\u05D5\u05E1", notes: "\u05D4\u05E2\u05E8\u05D5\u05EA" }} filename="goods_receipts" />
          <Button onClick={() => { setShowForm(!showForm); setForm({}); setEditId(null); }} className="gap-1">
            {showForm ? <><X className="w-4 h-4" />{'\u05E1\u05D2\u05D5\u05E8'}</> : <><Plus className="w-4 h-4" />{'\u05D4\u05D5\u05E1\u05E3 \u05E7\u05D1\u05DC\u05D4'}</>}
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder={'\u05D7\u05D9\u05E4\u05D5\u05E9...'} value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="rounded-lg border border-border bg-input px-3 py-2 text-foreground text-sm">
          <option value="all">{'\u05DB\u05DC \u05D4\u05E1\u05D8\u05D8\u05D5\u05E1\u05D9\u05DD'}</option>
          <option value="pending">{'\u05DE\u05DE\u05EA\u05D9\u05DF'}</option><option value="received">{'\u05D4\u05EA\u05E7\u05D1\u05DC'}</option><option value="partial">{'\u05D7\u05DC\u05E7\u05D9'}</option><option value="rejected">{'\u05E0\u05D3\u05D7\u05D4'}</option>
        </select>
      </div>

      {showForm && (
        <Card><CardContent className="p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">{editId ? '\u05E2\u05E8\u05D9\u05DB\u05EA \u05E7\u05D1\u05DC\u05D4' : '\u05E7\u05D1\u05DC\u05D4 \u05D7\u05D3\u05E9\u05D4'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <FIELD label={'\u05DE\u05E1\u05E4\u05E8 \u05E7\u05D1\u05DC\u05D4'}><input type="text" className={INPUT_CLS} value={form.receipt_number || ""} onChange={e => setForm({...form, receipt_number: e.target.value})} /></FIELD>
            <FIELD label={'\u05DE\u05E1\u05E4\u05E8 \u05D4\u05D6\u05DE\u05E0\u05EA \u05E8\u05DB\u05E9'}><input type="number" className={INPUT_CLS} value={form.purchase_order_id ?? ""} onChange={e => setForm({...form, purchase_order_id: e.target.value === "" ? null : Number(e.target.value)})} /></FIELD>
            <FIELD label={'\u05EA\u05D0\u05E8\u05D9\u05DA \u05E7\u05D1\u05DC\u05D4'}><input type="date" className={INPUT_CLS} value={form.receipt_date || ""} onChange={e => setForm({...form, receipt_date: e.target.value})} /></FIELD>
            <FIELD label={'\u05DE\u05E7\u05D1\u05DC'}><input type="number" className={INPUT_CLS} value={form.received_by ?? ""} onChange={e => setForm({...form, received_by: e.target.value === "" ? null : Number(e.target.value)})} /></FIELD>
            <FIELD label={'\u05DE\u05D7\u05E1\u05DF'}><input type="number" className={INPUT_CLS} value={form.warehouse_id ?? ""} onChange={e => setForm({...form, warehouse_id: e.target.value === "" ? null : Number(e.target.value)})} /></FIELD>
            <FIELD label={'\u05E1\u05D8\u05D8\u05D5\u05E1'}>
              <select className={INPUT_CLS} value={form.status || "pending"} onChange={e => setForm({...form, status: e.target.value})}>
                <option value="pending">{'\u05DE\u05DE\u05EA\u05D9\u05DF'}</option><option value="received">{'\u05D4\u05EA\u05E7\u05D1\u05DC'}</option><option value="partial">{'\u05D7\u05DC\u05E7\u05D9'}</option><option value="rejected">{'\u05E0\u05D3\u05D7\u05D4'}</option>
              </select>
            </FIELD>
            <FIELD label={'\u05D4\u05E2\u05E8\u05D5\u05EA'}><input type="text" className={INPUT_CLS} value={form.notes || ""} onChange={e => setForm({...form, notes: e.target.value})} /></FIELD>
          </div>
          <div className="mt-4 flex gap-2 justify-end">
            <Button variant="outline" onClick={() => { setShowForm(false); setForm({}); setEditId(null); }}>{'\u05D1\u05D9\u05D8\u05D5\u05DC'}</Button>
            <Button onClick={save} disabled={saving} className="gap-1">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}{editId ? '\u05E2\u05D3\u05DB\u05DF' : '\u05E9\u05DE\u05D5\u05E8'}</Button>
          </div>
        </CardContent></Card>
      )}

      {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400">{error}</div>}

      <div className="rounded-xl border border-border bg-card/30 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center"><Loader2 className="w-8 h-8 animate-spin text-blue-400 mx-auto mb-2" /><span className="text-muted-foreground">{'\u05D8\u05D5\u05E2\u05DF...'}</span></div>
        ) : pageData.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground"><PackageCheck className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="text-lg font-medium">{'\u05D0\u05D9\u05DF \u05E7\u05D1\u05DC\u05D5\u05EA \u05E2\u05D3\u05D9\u05D9\u05DF'}</p></div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground w-12">#</th>
                    <SortHeader field="receipt_number" label={'\u05DE\u05E1\u05E4\u05E8 \u05E7\u05D1\u05DC\u05D4'} />
                    <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">{'\u05D4\u05D6\u05DE\u05E0\u05EA \u05E8\u05DB\u05E9'}</th>
                    <SortHeader field="receipt_date" label={'\u05EA\u05D0\u05E8\u05D9\u05DA'} />
                    <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">{'\u05E1\u05D8\u05D8\u05D5\u05E1'}</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">{'\u05D4\u05E2\u05E8\u05D5\u05EA'}</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">{'\u05E4\u05E2\u05D5\u05DC\u05D5\u05EA'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {pageData.map(item => (
                    <tr key={item.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 text-sm text-muted-foreground">{item.id}</td>
                      <td className="px-4 py-3 text-sm text-foreground font-medium font-mono">{item.receipt_number}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{item.purchase_order_id || "-"}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{item.receipt_date ? fmtDate(item.receipt_date) : "-"}</td>
                      <td className="px-4 py-3"><Badge variant="secondary" className={STATUS_COLORS[item.status] || "bg-muted text-muted-foreground"}>{translateStatus(item.status)}</Badge></td>
                      <td className="px-4 py-3 text-sm text-muted-foreground max-w-[200px] truncate">{item.notes || "-"}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button onClick={() => { setForm(item); setEditId(item.id); setShowForm(true); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-yellow-500" /></button>
                          <button onClick={() => remove(item.id, item.receipt_number)} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <span className="text-sm text-muted-foreground">{'\u05DE\u05E6\u05D9\u05D2'} {(page-1)*PAGE_SIZE+1}-{Math.min(page*PAGE_SIZE, filtered.length)} {'\u05DE\u05EA\u05D5\u05DA'} {filtered.length}</span>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>{'\u05D4\u05E7\u05D5\u05D3\u05DD'}</Button>
                  <span className="px-3 py-1 text-sm text-muted-foreground">{page} / {totalPages}</span>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>{'\u05D4\u05D1\u05D0'}</Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
