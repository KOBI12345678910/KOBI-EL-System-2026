import { useState, useEffect, useMemo, useCallback } from "react";
import { authFetch } from "@/lib/utils";
import { duplicateRecord } from "@/lib/duplicate-record";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import ExportDropdown from "@/components/export-dropdown";
import { Search, Plus, Edit2, Trash2, ArrowUpDown, X, Save, Loader2, Layers, AlertTriangle, Copy } from "lucide-react";
import ImportButton from "@/components/import-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";

const API = "/api";
const PAGE_SIZE = 25;
const INPUT_CLS = "w-full rounded-lg border border-border bg-input px-3 py-2 text-foreground focus:ring-2 focus:ring-ring/50 focus:border-ring transition-colors";
const FIELD = (props: { label: string; children: React.ReactNode }) => (<div><label className="block text-sm font-medium text-muted-foreground mb-1">{props.label}</label>{props.children}</div>);

export default function RawMaterialsPage() {
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
  const [sortField, setSortField] = useState<string>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);

  useEffect(() => { const t = setTimeout(() => setDebouncedSearch(search), 300); return () => clearTimeout(t); }, [search]);

  const load = useCallback(async () => {
    try { setLoading(true); setError(null);
      const res = await authFetch(`${API}/raw-materials`);
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
      const url = editId ? `${API}/raw-materials/${editId}` : `${API}/raw-materials`;
      const res = await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "\u05E9\u05D2\u05D9\u05D0\u05D4 \u05D1\u05E9\u05DE\u05D9\u05E8\u05D4"); }
      toast({ title: editId ? "\u05D7\u05D5\u05DE\u05E8 \u05E2\u05D5\u05D3\u05DB\u05DF \u05D1\u05D4\u05E6\u05DC\u05D7\u05D4" : "\u05D7\u05D5\u05DE\u05E8 \u05E0\u05D5\u05E1\u05E3 \u05D1\u05D4\u05E6\u05DC\u05D7\u05D4", description: form.name || "" });
      setForm({}); setEditId(null); setShowForm(false); await load();
    } catch (e: any) { toast({ title: "\u05E9\u05D2\u05D9\u05D0\u05D4", description: e.message, variant: "destructive" }); }
    setSaving(false);
  };

  const remove = async (id: number, name: string) => {
    if (!await globalConfirm(`\u05D4\u05D0\u05DD \u05DC\u05DE\u05D7\u05D5\u05E7 \u05D0\u05EA \u05D4\u05D7\u05D5\u05DE\u05E8 "${name}"?`)) return;
    try { const res = await authFetch(`${API}/raw-materials/${id}`, { method: "DELETE" }); if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "\u05E9\u05D2\u05D9\u05D0\u05D4"); toast({ title: "\u05D7\u05D5\u05DE\u05E8 \u05E0\u05DE\u05D7\u05E7", description: name }); load(); }
    catch (e: any) { toast({ title: "\u05E9\u05D2\u05D9\u05D0\u05D4", description: e.message, variant: "destructive" }); }
  };

  const toggleSort = (field: string) => { if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField(field); setSortDir("asc"); } };

  const filtered = useMemo(() => {
    let d = [...items];
    if (debouncedSearch) { const s = debouncedSearch.toLowerCase(); d = d.filter(r => r.name?.toLowerCase().includes(s) || r.material_code?.toLowerCase().includes(s) || r.specifications?.toLowerCase().includes(s)); }
    if (sortField) d.sort((a, b) => { const av = a[sortField] ?? ""; const bv = b[sortField] ?? ""; const cmp = typeof av === "number" ? av - bv : String(av).localeCompare(String(bv), "he"); return sortDir === "asc" ? cmp : -cmp; });
    return d;
  }, [items, debouncedSearch, sortField, sortDir]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageData = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => { setPage(1); }, [debouncedSearch]);
  useEffect(() => { if (page > 1 && page > totalPages) setPage(Math.max(1, totalPages)); }, [totalPages]);

  const SortHeader = ({ field, label }: { field: string; label: string }) => (
    <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort(field)}>
      <span className="inline-flex items-center gap-1">{label}<ArrowUpDown className="w-3 h-3 opacity-40" /></span>
    </th>
  );

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="text-2xl font-bold text-foreground">{'\u05D7\u05D5\u05DE\u05E8\u05D9 \u05D2\u05DC\u05DD'}</h1><p className="text-sm text-muted-foreground mt-1">{items.length} {'\u05E4\u05E8\u05D9\u05D8\u05D9\u05DD'}</p></div>
        <div className="flex items-center gap-2">
          <ImportButton apiRoute="/api/raw-materials" onSuccess={load} />
          <ExportDropdown data={filtered} headers={{ name: "\u05E9\u05DD", material_code: "\u05E7\u05D5\u05D3", unit: "\u05D9\u05D7\u05D9\u05D3\u05D4", stock_quantity: "\u05DE\u05DC\u05D0\u05D9", min_stock_level: "\u05DE\u05D9\u05E0\u05D9\u05DE\u05D5\u05DD", specifications: "\u05DE\u05E4\u05E8\u05D8" }} filename="raw_materials" />
          <Button onClick={() => { setShowForm(!showForm); setForm({}); setEditId(null); }} className="gap-1">
            {showForm ? <><X className="w-4 h-4" />{'\u05E1\u05D2\u05D5\u05E8'}</> : <><Plus className="w-4 h-4" />{'\u05D4\u05D5\u05E1\u05E3 \u05D7\u05D5\u05DE\u05E8'}</>}
          </Button>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder={'\u05D7\u05D9\u05E4\u05D5\u05E9 \u05D7\u05D5\u05DE\u05E8\u05D9\u05DD...'} value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
      </div>

      {showForm && (
        <Card><CardContent className="p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">{editId ? '\u05E2\u05E8\u05D9\u05DB\u05EA \u05D7\u05D5\u05DE\u05E8' : '\u05D4\u05D5\u05E1\u05E4\u05EA \u05D7\u05D5\u05DE\u05E8 \u05D7\u05D3\u05E9'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <FIELD label={'\u05E9\u05DD \u05D7\u05D5\u05DE\u05E8'}><input type="text" className={INPUT_CLS} value={form.name || ""} onChange={e => setForm({...form, name: e.target.value})} /></FIELD>
            <FIELD label={'\u05E7\u05D5\u05D3 \u05D7\u05D5\u05DE\u05E8'}><input type="text" className={INPUT_CLS} value={form.material_code || ""} onChange={e => setForm({...form, material_code: e.target.value})} /></FIELD>
            <FIELD label={'\u05D9\u05D7\u05D9\u05D3\u05EA \u05DE\u05D9\u05D3\u05D4'}>
              <select className={INPUT_CLS} value={form.unit || ""} onChange={e => setForm({...form, unit: e.target.value})}>
                <option value="">{'\u05D1\u05D7\u05E8 \u05D9\u05D7\u05D9\u05D3\u05D4'}</option>
                <option value="kg">{'\u05E7"\u05D2'}</option><option value="m">{'\u05DE\u05D8\u05E8'}</option><option value="m2">{'\u05DE"\u05E8'}</option><option value="unit">{'\u05D9\u05D7\u05D9\u05D3\u05D4'}</option><option value="liter">{'\u05DC\u05D9\u05D8\u05E8'}</option><option value="ton">{'\u05D8\u05D5\u05DF'}</option>
              </select>
            </FIELD>
            <FIELD label={'\u05DE\u05D7\u05D9\u05E8 (\u05D0\u05D2\u05D5\u05E8\u05D5\u05EA)'}><input type="number" className={INPUT_CLS} value={form.unit_price_cents ?? ""} onChange={e => setForm({...form, unit_price_cents: e.target.value === "" ? null : Number(e.target.value)})} /></FIELD>
            <FIELD label={'\u05DB\u05DE\u05D5\u05EA \u05D1\u05DE\u05DC\u05D0\u05D9'}><input type="number" className={INPUT_CLS} value={form.stock_quantity ?? ""} onChange={e => setForm({...form, stock_quantity: e.target.value === "" ? null : Number(e.target.value)})} /></FIELD>
            <FIELD label={'\u05DE\u05DC\u05D0\u05D9 \u05DE\u05D9\u05E0\u05D9\u05DE\u05D5\u05DD'}><input type="number" className={INPUT_CLS} value={form.min_stock_level ?? ""} onChange={e => setForm({...form, min_stock_level: e.target.value === "" ? null : Number(e.target.value)})} /></FIELD>
            <FIELD label={'\u05DE\u05E1\u05E4\u05E8 \u05E1\u05E4\u05E7'}><input type="number" className={INPUT_CLS} value={form.supplier_id ?? ""} onChange={e => setForm({...form, supplier_id: e.target.value === "" ? null : Number(e.target.value)})} /></FIELD>
            <FIELD label={'\u05DE\u05E4\u05E8\u05D8'}><input type="text" className={INPUT_CLS} value={form.specifications || ""} onChange={e => setForm({...form, specifications: e.target.value})} /></FIELD>
          </div>
          <div className="mt-4 flex gap-2 justify-end">
            <Button variant="outline" onClick={() => { setShowForm(false); setForm({}); setEditId(null); }}>{'\u05D1\u05D9\u05D8\u05D5\u05DC'}</Button>
            <Button onClick={save} disabled={saving || !form.name} className="gap-1">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}{editId ? '\u05E2\u05D3\u05DB\u05DF' : '\u05E9\u05DE\u05D5\u05E8'}</Button>
          </div>
        </CardContent></Card>
      )}

      {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400">{error}</div>}

      <div className="rounded-xl border border-border bg-card/30 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center"><Loader2 className="w-8 h-8 animate-spin text-blue-400 mx-auto mb-2" /><span className="text-muted-foreground">{'\u05D8\u05D5\u05E2\u05DF...'}</span></div>
        ) : pageData.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground"><Layers className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="text-lg font-medium">{debouncedSearch ? '\u05DC\u05D0 \u05E0\u05DE\u05E6\u05D0\u05D5 \u05EA\u05D5\u05E6\u05D0\u05D5\u05EA' : '\u05D0\u05D9\u05DF \u05D7\u05D5\u05DE\u05E8\u05D9\u05DD \u05E2\u05D3\u05D9\u05D9\u05DF'}</p></div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground w-12">#</th>
                    <SortHeader field="name" label={'\u05E9\u05DD'} />
                    <SortHeader field="material_code" label={'\u05E7\u05D5\u05D3'} />
                    <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">{'\u05D9\u05D7\u05D9\u05D3\u05D4'}</th>
                    <SortHeader field="stock_quantity" label={'\u05DE\u05DC\u05D0\u05D9'} />
                    <SortHeader field="min_stock_level" label={'\u05DE\u05D9\u05E0\u05D9\u05DE\u05D5\u05DD'} />
                    <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">{'\u05E1\u05D8\u05D8\u05D5\u05E1'}</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">{'\u05E4\u05E2\u05D5\u05DC\u05D5\u05EA'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {pageData.map(item => {
                    const qty = Number(item.stock_quantity || 0); const minQty = Number(item.min_stock_level || 0);
                    const isLow = qty > 0 && qty <= minQty; const isOut = qty === 0;
                    return (
                      <tr key={item.id} className={`hover:bg-muted/20 transition-colors ${isOut ? "bg-red-500/5" : isLow ? "bg-amber-500/5" : ""}`}>
                        <td className="px-4 py-3 text-sm text-muted-foreground">{item.id}</td>
                        <td className="px-4 py-3 text-sm text-foreground font-medium">{item.name}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground font-mono">{item.material_code}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">{item.unit}</td>
                        <td className="px-4 py-3 text-sm"><span className={isOut ? "text-red-500 font-bold" : isLow ? "text-amber-500 font-bold" : "text-muted-foreground"}>{qty}</span>{(isLow || isOut) && <AlertTriangle className="w-3.5 h-3.5 inline mr-1 text-amber-500" />}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">{minQty}</td>
                        <td className="px-4 py-3"><Badge variant="secondary" className={isOut ? "bg-red-500/20 text-red-600 dark:text-red-400" : isLow ? "bg-amber-500/20 text-amber-600 dark:text-amber-400" : "bg-green-500/20 text-green-600 dark:text-green-400"}>{isOut ? '\u05D0\u05D6\u05DC' : isLow ? '\u05E0\u05DE\u05D5\u05DA' : '\u05D1\u05DE\u05DC\u05D0\u05D9'}</Badge></td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <button onClick={() => { setForm(item); setEditId(item.id); setShowForm(true); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="p-1.5 hover:bg-muted rounded-lg" title={'\u05E2\u05E8\u05D9\u05DB\u05D4'}><Edit2 className="w-3.5 h-3.5 text-yellow-500" /></button>
                            <button onClick={async () => { const _dup = await duplicateRecord(`${API}/raw-materials`, item.id); if (_dup.ok) { load(); } else { alert("שגיאה בשכפול: " + _dup.error); } }} className="p-1.5 hover:bg-muted rounded-lg" title="שכפול"><Copy className="w-3.5 h-3.5 text-blue-500" /></button>
                            <button onClick={() => remove(item.id, item.name)} className="p-1.5 hover:bg-muted rounded-lg" title={'\u05DE\u05D7\u05D9\u05E7\u05D4'}><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
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
