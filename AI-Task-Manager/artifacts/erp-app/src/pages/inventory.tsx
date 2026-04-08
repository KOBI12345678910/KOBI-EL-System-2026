import { useState, useEffect, useMemo } from "react";
import { authFetch } from "@/lib/utils";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import ExportDropdown from "@/components/export-dropdown";
import { Search, Plus, Edit2, Trash2, ArrowUpDown, X, Save, Loader2, Package, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { ErrorState } from "@/components/ui/unified-states";
import { useTimedFetch } from "@/hooks/use-timed-fetch";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";

const API = "/api";
const PAGE_SIZE = 25;
const fmt = (v: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS" }).format(v / 100);

const FIELD = (props: { label: string; children: React.ReactNode }) => (
  <div>
    <label className="block text-sm font-medium text-gray-300 mb-1">{props.label}</label>
    {props.children}
  </div>
);

const INPUT_CLS = "w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-foreground focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-colors";

export default function ProductsPage() {
  const { data: rawData, loading, error, retry } = useTimedFetch<any>(`${API}/products`);
  const items: any[] = rawData ? (Array.isArray(rawData) ? rawData : rawData.data || rawData.items || []) : [];

  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<any>({});
  const [editId, setEditId] = useState<number | null>(null);

  const validation = useFormValidation({
    name: { required: true, message: "שם מוצר חובה" },
    sku: { required: true, message: "SKU חובה" },
  });
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortField, setSortField] = useState<string>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const save = async () => {
    if (!validation.validate(form)) return;
    setSaving(true);
    try {
      const method = editId ? "PUT" : "POST";
      const url = editId ? `${API}/products/${editId}` : `${API}/products`;
      const res = await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "\u05E9\u05D2\u05D9\u05D0\u05D4 \u05D1\u05E9\u05DE\u05D9\u05E8\u05D4");
      }
      toast({ title: editId ? "\u05DE\u05D5\u05E6\u05E8 \u05E2\u05D5\u05D3\u05DB\u05DF \u05D1\u05D4\u05E6\u05DC\u05D7\u05D4" : "\u05DE\u05D5\u05E6\u05E8 \u05E0\u05D5\u05E1\u05E3 \u05D1\u05D4\u05E6\u05DC\u05D7\u05D4", description: form.name || "" });
      setForm({}); setEditId(null); setShowForm(false);
      retry();
    } catch (e: any) {
      toast({ title: "\u05E9\u05D2\u05D9\u05D0\u05D4", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const remove = async (id: number, name: string) => {
    const confirmed = await globalConfirm(`\u05D4\u05D0\u05DD \u05DC\u05DE\u05D7\u05D5\u05E7 \u05D0\u05EA \u05D4\u05DE\u05D5\u05E6\u05E8 "${name}"? \u05E4\u05E2\u05D5\u05DC\u05D4 \u05D6\u05D5 \u05D0\u05D9\u05E0\u05D4 \u05E0\u05D9\u05EA\u05E0\u05EA \u05DC\u05D1\u05D9\u05D8\u05D5\u05DC.`);
    if (!confirmed) return;
    try {
      const res = await authFetch(`${API}/products/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "\u05E9\u05D2\u05D9\u05D0\u05D4 \u05D1\u05DE\u05D7\u05D9\u05E7\u05D4");
      toast({ title: "\u05DE\u05D5\u05E6\u05E8 \u05E0\u05DE\u05D7\u05E7", description: name });
      retry();
    } catch (e: any) {
      toast({ title: "\u05E9\u05D2\u05D9\u05D0\u05D4 \u05D1\u05DE\u05D7\u05D9\u05E7\u05D4", description: e.message, variant: "destructive" });
    }
  };

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  const categories = useMemo(() => {
    const cats = new Set<string>();
    items.forEach(i => { if (i.category) cats.add(i.category); });
    return Array.from(cats).sort();
  }, [items]);

  const filtered = useMemo(() => {
    let d = [...items];
    if (debouncedSearch) {
      const s = debouncedSearch.toLowerCase();
      d = d.filter(r =>
        r.name?.toLowerCase().includes(s) ||
        r.sku?.toLowerCase().includes(s) ||
        r.category?.toLowerCase().includes(s)
      );
    }
    if (categoryFilter !== "all") {
      d = d.filter(r => r.category === categoryFilter);
    }
    if (sortField) {
      d.sort((a, b) => {
        const av = a[sortField] ?? "";
        const bv = b[sortField] ?? "";
        const cmp = typeof av === "number" ? av - bv : String(av).localeCompare(String(bv), "he");
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return d;
  }, [items, debouncedSearch, categoryFilter, sortField, sortDir]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageData = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [debouncedSearch, categoryFilter]);
  useEffect(() => { if (page > 1 && page > totalPages) setPage(Math.max(1, totalPages)); }, [totalPages]);

  const lowStockCount = items.filter(r => r.stock_quantity != null && r.min_stock_level != null && Number(r.stock_quantity) <= Number(r.min_stock_level) && Number(r.stock_quantity) > 0).length;
  const outOfStockCount = items.filter(r => Number(r.stock_quantity || 0) === 0).length;

  const SortHeader = ({ field, label }: { field: string; label: string }) => (
    <th className="px-4 py-3 text-right text-sm font-medium text-gray-300 cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort(field)}>
      <span className="inline-flex items-center gap-1">{label}<ArrowUpDown className="w-3 h-3 opacity-40" /></span>
    </th>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return <ErrorState description={error.message} onRetry={retry} />;
  }

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{'\u05E0\u05D9\u05D4\u05D5\u05DC \u05DE\u05DC\u05D0\u05D9'}</h1>
          <p className="text-sm text-gray-400 mt-1">{items.length} {'\u05DE\u05D5\u05E6\u05E8\u05D9\u05DD'} {lowStockCount > 0 && <span className="text-amber-400">({lowStockCount} {'\u05DE\u05DC\u05D0\u05D9 \u05E0\u05DE\u05D5\u05DA'})</span>} {outOfStockCount > 0 && <span className="text-red-400">({outOfStockCount} {'\u05D0\u05D6\u05DC'})</span>}</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportDropdown data={filtered} headers={{ name: "\u05E9\u05DD", sku: "SKU", category: "\u05E7\u05D8\u05D2\u05D5\u05E8\u05D9\u05D4", unit_price_cents: "\u05DE\u05D7\u05D9\u05E8 (\u05D0\u05D2\u05D5\u05E8\u05D5\u05EA)", stock_quantity: "\u05DE\u05DC\u05D0\u05D9", min_stock_level: "\u05DE\u05D9\u05E0\u05D9\u05DE\u05D5\u05DD" }} filename="inventory" />
          <Button onClick={() => { setShowForm(!showForm); setForm({}); setEditId(null); }} className="gap-1">
            {showForm ? <><X className="w-4 h-4" />{'\u05E1\u05D2\u05D5\u05E8'}</> : <><Plus className="w-4 h-4" />{'\u05D4\u05D5\u05E1\u05E3 \u05DE\u05D5\u05E6\u05E8'}</>}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-blue-500/5 border-blue-500/20"><CardContent className="p-3 text-center"><p className="text-2xl font-bold text-blue-400">{items.length}</p><p className="text-xs text-gray-400">{'\u05E1\u05D4"\u05DB \u05DE\u05D5\u05E6\u05E8\u05D9\u05DD'}</p></CardContent></Card>
        <Card className="bg-green-500/5 border-green-500/20"><CardContent className="p-3 text-center"><p className="text-2xl font-bold text-green-400">{items.filter(r => Number(r.stock_quantity || 0) > Number(r.min_stock_level || 0)).length}</p><p className="text-xs text-gray-400">{'\u05D1\u05DE\u05DC\u05D0\u05D9'}</p></CardContent></Card>
        <Card className="bg-amber-500/5 border-amber-500/20"><CardContent className="p-3 text-center"><p className="text-2xl font-bold text-amber-400">{lowStockCount}</p><p className="text-xs text-gray-400">{'\u05DE\u05DC\u05D0\u05D9 \u05E0\u05DE\u05D5\u05DA'}</p></CardContent></Card>
        <Card className="bg-red-500/5 border-red-500/20"><CardContent className="p-3 text-center"><p className="text-2xl font-bold text-red-400">{outOfStockCount}</p><p className="text-xs text-gray-400">{'\u05D0\u05D6\u05DC \u05D1\u05DE\u05DC\u05D0\u05D9'}</p></CardContent></Card>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input placeholder={'\u05D7\u05D9\u05E4\u05D5\u05E9 \u05DE\u05D5\u05E6\u05E8\u05D9\u05DD...'} value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
        </div>
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-foreground text-sm">
          <option value="all">{'\u05DB\u05DC \u05D4\u05E7\u05D8\u05D2\u05D5\u05E8\u05D9\u05D5\u05EA'}</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {showForm && (
        <Card>
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold text-foreground mb-4">{editId ? '\u05E2\u05E8\u05D9\u05DB\u05EA \u05DE\u05D5\u05E6\u05E8' : '\u05D4\u05D5\u05E1\u05E4\u05EA \u05DE\u05D5\u05E6\u05E8 \u05D7\u05D3\u05E9'}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">שם מוצר <RequiredMark /></label>
                <input type="text" className={`${INPUT_CLS} ${validation.getFieldProps("name").className}`} placeholder="שם המוצר" value={form.name || ""} onChange={e => setForm({...form, name: e.target.value})} />
                <FormFieldError error={validation.errors.name} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">SKU <RequiredMark /></label>
                <input type="text" className={`${INPUT_CLS} ${validation.getFieldProps("sku").className}`} placeholder="SKU" value={form.sku || ""} onChange={e => setForm({...form, sku: e.target.value})} />
                <FormFieldError error={validation.errors.sku} />
              </div>
              <FIELD label={'\u05E7\u05D8\u05D2\u05D5\u05E8\u05D9\u05D4'}><input type="text" className={INPUT_CLS} placeholder={'\u05E7\u05D8\u05D2\u05D5\u05E8\u05D9\u05D4'} value={form.category || ""} onChange={e => setForm({...form, category: e.target.value})} /></FIELD>
              <FIELD label={'\u05DE\u05D7\u05D9\u05E8 (\u05D0\u05D2\u05D5\u05E8\u05D5\u05EA)'}><input type="number" className={INPUT_CLS} placeholder="0" value={form.unit_price_cents ?? ""} onChange={e => setForm({...form, unit_price_cents: e.target.value === "" ? null : Number(e.target.value)})} /></FIELD>
              <FIELD label={'\u05DB\u05DE\u05D5\u05EA \u05D1\u05DE\u05DC\u05D0\u05D9'}><input type="number" className={INPUT_CLS} placeholder="0" value={form.stock_quantity ?? ""} onChange={e => setForm({...form, stock_quantity: e.target.value === "" ? null : Number(e.target.value)})} /></FIELD>
              <FIELD label={'\u05DE\u05DC\u05D0\u05D9 \u05DE\u05D9\u05E0\u05D9\u05DE\u05D5\u05DD'}><input type="number" className={INPUT_CLS} placeholder="0" value={form.min_stock_level ?? ""} onChange={e => setForm({...form, min_stock_level: e.target.value === "" ? null : Number(e.target.value)})} /></FIELD>
              <FIELD label={'\u05DE\u05E1\u05E4\u05E8 \u05E1\u05E4\u05E7'}><input type="number" className={INPUT_CLS} placeholder={'\u05DE\u05E1\u05E4\u05E8 \u05E1\u05E4\u05E7'} value={form.supplier_id ?? ""} onChange={e => setForm({...form, supplier_id: e.target.value === "" ? null : Number(e.target.value)})} /></FIELD>
              <FIELD label={'\u05E1\u05D8\u05D8\u05D5\u05E1'}>
                <select className={INPUT_CLS} value={form.is_active ?? "true"} onChange={e => setForm({...form, is_active: e.target.value === "true"})}>
                  <option value="true">{'\u05E4\u05E2\u05D9\u05DC'}</option>
                  <option value="false">{'\u05DC\u05D0 \u05E4\u05E2\u05D9\u05DC'}</option>
                </select>
              </FIELD>
            </div>
            <div className="mt-4 flex gap-2 justify-end">
              <Button variant="outline" onClick={() => { setShowForm(false); setForm({}); setEditId(null); validation.clearErrors(); }}>{'\u05D1\u05D9\u05D8\u05D5\u05DC'}</Button>
              <Button onClick={save} disabled={saving} className="gap-1">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {editId ? '\u05E2\u05D3\u05DB\u05DF' : '\u05E9\u05DE\u05D5\u05E8'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="rounded-xl border border-border/50 bg-muted/30 overflow-hidden">
        {pageData.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-lg font-medium">{debouncedSearch ? '\u05DC\u05D0 \u05E0\u05DE\u05E6\u05D0\u05D5 \u05DE\u05D5\u05E6\u05E8\u05D9\u05DD \u05EA\u05D5\u05D0\u05DE\u05D9\u05DD' : '\u05D0\u05D9\u05DF \u05DE\u05D5\u05E6\u05E8\u05D9\u05DD \u05E2\u05D3\u05D9\u05D9\u05DF'}</p>
            <p className="text-sm mt-1">{'\u05DC\u05D7\u05E5 \u05E2\u05DC "\u05D4\u05D5\u05E1\u05E3 \u05DE\u05D5\u05E6\u05E8" \u05DC\u05D4\u05EA\u05D7\u05D9\u05DC'}</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/60 border-b border-border/50">
                  <tr>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-300 w-12">#</th>
                    <SortHeader field="name" label={'\u05E9\u05DD'} />
                    <SortHeader field="sku" label="SKU" />
                    <SortHeader field="category" label={'\u05E7\u05D8\u05D2\u05D5\u05E8\u05D9\u05D4'} />
                    <SortHeader field="unit_price_cents" label={'\u05DE\u05D7\u05D9\u05E8'} />
                    <SortHeader field="stock_quantity" label={'\u05DE\u05DC\u05D0\u05D9'} />
                    <SortHeader field="min_stock_level" label={'\u05DE\u05D9\u05E0\u05D9\u05DE\u05D5\u05DD'} />
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-300">{'\u05E1\u05D8\u05D8\u05D5\u05E1'}</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-300">{'\u05E4\u05E2\u05D5\u05DC\u05D5\u05EA'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/30">
                  {pageData.map(item => {
                    const qty = Number(item.stock_quantity || 0);
                    const minQty = Number(item.min_stock_level || 0);
                    const isLow = qty > 0 && qty <= minQty;
                    const isOut = qty === 0;
                    return (
                      <tr key={item.id} className={`hover:bg-muted/20 transition-colors ${isOut ? "bg-red-500/5" : isLow ? "bg-amber-500/5" : ""}`}>
                        <td className="px-4 py-3 text-sm text-gray-500">{item.id}</td>
                        <td className="px-4 py-3 text-sm text-foreground font-medium">{item.name}</td>
                        <td className="px-4 py-3 text-sm text-gray-300 font-mono">{item.sku}</td>
                        <td className="px-4 py-3 text-sm text-gray-300">{item.category}</td>
                        <td className="px-4 py-3 text-sm text-gray-300">{item.unit_price_cents ? fmt(item.unit_price_cents) : "-"}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className={isOut ? "text-red-400 font-bold" : isLow ? "text-amber-400 font-bold" : "text-gray-300"}>
                            {qty}
                          </span>
                          {isLow && <AlertTriangle className="w-3.5 h-3.5 inline mr-1 text-amber-400" />}
                          {isOut && <AlertTriangle className="w-3.5 h-3.5 inline mr-1 text-red-400" />}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-300">{minQty}</td>
                        <td className="px-4 py-3">
                          <Badge variant="secondary" className={isOut ? "bg-red-500/20 text-red-400" : isLow ? "bg-amber-500/20 text-amber-400" : "bg-green-500/20 text-green-400"}>
                            {isOut ? '\u05D0\u05D6\u05DC' : isLow ? '\u05E0\u05DE\u05D5\u05DA' : '\u05D1\u05DE\u05DC\u05D0\u05D9'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <button onClick={() => { setForm(item); setEditId(item.id); setShowForm(true); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="p-1.5 hover:bg-muted/50 rounded-lg transition-colors" title={'\u05E2\u05E8\u05D9\u05DB\u05D4'}>
                              <Edit2 className="w-3.5 h-3.5 text-yellow-400" />
                            </button>
                            <button onClick={() => remove(item.id, item.name)} className="p-1.5 hover:bg-muted/50 rounded-lg transition-colors" title={'\u05DE\u05D7\u05D9\u05E7\u05D4'}>
                              <Trash2 className="w-3.5 h-3.5 text-red-400" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border/50">
                <span className="text-sm text-gray-400">{'\u05DE\u05E6\u05D9\u05D2'} {(page-1)*PAGE_SIZE+1}-{Math.min(page*PAGE_SIZE, filtered.length)} {'\u05DE\u05EA\u05D5\u05DA'} {filtered.length}</span>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>{'\u05D4\u05E7\u05D5\u05D3\u05DD'}</Button>
                  <span className="px-3 py-1 text-sm text-gray-300">{page} / {totalPages}</span>
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
