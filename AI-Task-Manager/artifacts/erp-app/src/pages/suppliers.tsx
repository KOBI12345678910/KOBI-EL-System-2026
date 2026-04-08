import { useState, useEffect, useMemo, useCallback } from "react";
import { authFetch } from "@/lib/utils";
import { duplicateRecord } from "@/lib/duplicate-record";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import ExportDropdown from "@/components/export-dropdown";
import { Search, Plus, Edit2, Trash2, ArrowUpDown, X, Save, Loader2, Building2, Phone, Mail, MapPin, CreditCard, Hash, CheckCircle2, XCircle, Download, Copy } from "lucide-react";
import ImportButton from "@/components/import-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";

const API = "/api";
const PAGE_SIZE = 25;

const PAYMENT_TERMS: Record<string, string> = {
  "net_30": "\u05E9\u05D5\u05D8\u05E3+30",
  "net_60": "\u05E9\u05D5\u05D8\u05E3+60",
  "net_90": "\u05E9\u05D5\u05D8\u05E3+90",
  "immediate": "\u05DE\u05D9\u05D9\u05D3\u05D9",
  "eom": "\u05E1\u05D5\u05E3 \u05D7\u05D5\u05D3\u05E9",
};

const FIELD = (props: { label: string; children: React.ReactNode }) => (
  <div>
    <label className="block text-sm font-medium text-muted-foreground mb-1">{props.label}</label>
    {props.children}
  </div>
);

const INPUT_CLS = "w-full rounded-lg border border-border bg-input px-3 py-2 text-foreground focus:ring-2 focus:ring-ring/50 focus:border-ring transition-colors";

export default function SuppliersPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<any>({});
  const [editId, setEditId] = useState<number | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortField, setSortField] = useState<string>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await authFetch(`${API}/suppliers`);
      if (res.ok) {
        const data = await res.json();
        setItems(Array.isArray(data) ? data : data.data || data.items || []);
      } else {
        setError("\u05E9\u05D2\u05D9\u05D0\u05D4 \u05D1\u05D8\u05E2\u05D9\u05E0\u05EA \u05E0\u05EA\u05D5\u05E0\u05D9\u05DD");
      }
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    const errs: Record<string, string> = {};
    if (!form.name || !String(form.name).trim()) {
      errs.name = "שם ספק הוא שדה חובה";
    } else if (String(form.name).trim().length < 2) {
      errs.name = "שם ספק חייב להכיל לפחות 2 תווים";
    } else if (String(form.name).length > 150) {
      errs.name = "שם ספק לא יכול לעלות על 150 תווים";
    }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      errs.email = "כתובת אימייל לא תקינה";
    }
    if (form.phone && form.phone.trim() && !/^[\d\s\-+()]{7,20}$/.test(form.phone.replace(/\s/g, ""))) {
      errs.phone = "מספר טלפון לא תקין";
    }
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSaving(true);
    try {
      const method = editId ? "PUT" : "POST";
      const url = editId ? `${API}/suppliers/${editId}` : `${API}/suppliers`;
      const res = await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        if (e.errors) { setFieldErrors(e.errors); setSaving(false); return; }
        throw new Error(e.error || "שגיאה בשמירה");
      }
      toast({ title: editId ? "ספק עודכן בהצלחה" : "ספק נוסף בהצלחה", description: form.name || "" });
      setForm({}); setEditId(null); setShowForm(false); setFieldErrors({});
      await load();
    } catch (e: any) {
      toast({ title: "שגיאה", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const remove = async (id: number, name: string) => {
    const confirmed = await globalConfirm(`\u05D4\u05D0\u05DD \u05DC\u05DE\u05D7\u05D5\u05E7 \u05D0\u05EA \u05D4\u05E1\u05E4\u05E7 "${name}"? \u05E4\u05E2\u05D5\u05DC\u05D4 \u05D6\u05D5 \u05D0\u05D9\u05E0\u05D4 \u05E0\u05D9\u05EA\u05E0\u05EA \u05DC\u05D1\u05D9\u05D8\u05D5\u05DC.`);
    if (!confirmed) return;
    try {
      const res = await authFetch(`${API}/suppliers/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "\u05E9\u05D2\u05D9\u05D0\u05D4 \u05D1\u05DE\u05D7\u05D9\u05E7\u05D4");
      toast({ title: "\u05E1\u05E4\u05E7 \u05E0\u05DE\u05D7\u05E7", description: name });
      load();
    } catch (e: any) {
      toast({ title: "\u05E9\u05D2\u05D9\u05D0\u05D4 \u05D1\u05DE\u05D7\u05D9\u05E7\u05D4", description: e.message, variant: "destructive" });
    }
  };

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  const filtered = useMemo(() => {
    let d = [...items];
    if (debouncedSearch) {
      const s = debouncedSearch.toLowerCase();
      d = d.filter(r =>
        r.name?.toLowerCase().includes(s) ||
        r.supplier_number?.toLowerCase().includes(s) ||
        r.contact_person?.toLowerCase().includes(s) ||
        r.email?.toLowerCase().includes(s) ||
        r.phone?.includes(s)
      );
    }
    if (statusFilter !== "all") {
      const isActive = statusFilter === "active";
      d = d.filter(r => {
        const val = r.is_active;
        return isActive ? (val === true || val === "true" || val === 1) : (val === false || val === "false" || val === 0);
      });
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
  }, [items, debouncedSearch, statusFilter, sortField, sortDir]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageData = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [debouncedSearch, statusFilter]);
  useEffect(() => { if (page > 1 && page > totalPages) setPage(Math.max(1, totalPages)); }, [totalPages]);

  const activeCount = items.filter(r => r.is_active === true || r.is_active === "true" || r.is_active === 1).length;

  const SortHeader = ({ field, label }: { field: string; label: string }) => (
    <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort(field)}>
      <span className="inline-flex items-center gap-1">{label}<ArrowUpDown className="w-3 h-3 opacity-40" /></span>
    </th>
  );

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{'\u05E1\u05E4\u05E7\u05D9\u05DD'}</h1>
          <p className="text-sm text-muted-foreground mt-1">{items.length} {'\u05E1\u05E4\u05E7\u05D9\u05DD'} ({activeCount} {'\u05E4\u05E2\u05D9\u05DC\u05D9\u05DD'})</p>
        </div>
        <div className="flex items-center gap-2">
          <ImportButton apiRoute="/api/suppliers" onSuccess={load} />
          <ExportDropdown data={filtered} headers={{ name: "\u05E9\u05DD", supplier_number: "\u05DE\u05E1\u05E4\u05E8", contact_person: "\u05D0\u05D9\u05E9 \u05E7\u05E9\u05E8", phone: "\u05D8\u05DC\u05E4\u05D5\u05DF", email: "\u05D0\u05D9\u05DE\u05D9\u05D9\u05DC", address: "\u05DB\u05EA\u05D5\u05D1\u05EA", payment_terms: "\u05EA\u05E0\u05D0\u05D9 \u05EA\u05E9\u05DC\u05D5\u05DD" }} filename="suppliers" />
          <Button onClick={() => { setShowForm(!showForm); setForm({}); setEditId(null); }} className="gap-1">
            {showForm ? <><X className="w-4 h-4" />{'\u05E1\u05D2\u05D5\u05E8'}</> : <><Plus className="w-4 h-4" />{'\u05D4\u05D5\u05E1\u05E3 \u05E1\u05E4\u05E7'}</>}
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={'\u05D7\u05D9\u05E4\u05D5\u05E9 \u05E1\u05E4\u05E7\u05D9\u05DD...'}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pr-9"
          />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="rounded-lg border border-border bg-input px-3 py-2 text-foreground text-sm">
          <option value="all">{'\u05DB\u05DC \u05D4\u05E1\u05D8\u05D8\u05D5\u05E1\u05D9\u05DD'}</option>
          <option value="active">{'\u05E4\u05E2\u05D9\u05DC\u05D9\u05DD'}</option>
          <option value="inactive">{'\u05DC\u05D0 \u05E4\u05E2\u05D9\u05DC\u05D9\u05DD'}</option>
        </select>
      </div>

      {showForm && (
        <Card>
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold text-foreground mb-4">{editId ? '\u05E2\u05E8\u05D9\u05DB\u05EA \u05E1\u05E4\u05E7' : '\u05D4\u05D5\u05E1\u05E4\u05EA \u05E1\u05E4\u05E7 \u05D7\u05D3\u05E9'}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <FIELD label={'שם ספק *'}>
                <input type="text" className={`${INPUT_CLS} ${fieldErrors.name ? "border-red-500" : ""}`} placeholder={'שם הספק'} maxLength={150} value={form.name || ""} onChange={e => { setForm({...form, name: e.target.value}); setFieldErrors(p => ({...p, name: ""})); }} />
                {fieldErrors.name && <p className="text-xs text-red-400 mt-1">{fieldErrors.name}</p>}
              </FIELD>
              <FIELD label={'מספר ספק'}><input type="text" className={INPUT_CLS} placeholder={'מספר ספק'} maxLength={20} value={form.supplier_number || ""} onChange={e => setForm({...form, supplier_number: e.target.value})} /></FIELD>
              <FIELD label={'איש קשר'}><input type="text" className={INPUT_CLS} placeholder={'איש קשר'} maxLength={100} value={form.contact_person || ""} onChange={e => setForm({...form, contact_person: e.target.value})} /></FIELD>
              <FIELD label={'טלפון'}>
                <input type="tel" className={`${INPUT_CLS} ${fieldErrors.phone ? "border-red-500" : ""}`} placeholder="050-0000000" maxLength={20} value={form.phone || ""} onChange={e => { setForm({...form, phone: e.target.value}); setFieldErrors(p => ({...p, phone: ""})); }} />
                {fieldErrors.phone && <p className="text-xs text-red-400 mt-1">{fieldErrors.phone}</p>}
              </FIELD>
              <FIELD label={'אימייל'}>
                <input type="email" className={`${INPUT_CLS} ${fieldErrors.email ? "border-red-500" : ""}`} placeholder="email@example.com" maxLength={150} value={form.email || ""} onChange={e => { setForm({...form, email: e.target.value}); setFieldErrors(p => ({...p, email: ""})); }} />
                {fieldErrors.email && <p className="text-xs text-red-400 mt-1">{fieldErrors.email}</p>}
              </FIELD>
              <FIELD label={'כתובת'}><input type="text" className={INPUT_CLS} placeholder={'כתובת'} maxLength={200} value={form.address || ""} onChange={e => setForm({...form, address: e.target.value})} /></FIELD>
              <FIELD label={'תנאי תשלום'}>
                <select className={INPUT_CLS} value={form.payment_terms || ""} onChange={e => setForm({...form, payment_terms: e.target.value})}>
                  <option value="">{'בחר תנאי תשלום'}</option>
                  <option value="immediate">{'מיידי'}</option>
                  <option value="net_30">{'שוטף+30'}</option>
                  <option value="net_60">{'שוטף+60'}</option>
                  <option value="net_90">{'שוטף+90'}</option>
                  <option value="eom">{'סוף חודש'}</option>
                </select>
              </FIELD>
              <FIELD label={'סטטוס'}>
                <select className={INPUT_CLS} value={form.is_active ?? "true"} onChange={e => setForm({...form, is_active: e.target.value === "true"})}>
                  <option value="true">{'פעיל'}</option>
                  <option value="false">{'לא פעיל'}</option>
                </select>
              </FIELD>
            </div>
            <div className="mt-4 flex gap-2 justify-end">
              <Button variant="outline" onClick={() => { setShowForm(false); setForm({}); setEditId(null); setFieldErrors({}); }}>{'ביטול'}</Button>
              <Button onClick={save} disabled={saving} className="gap-1">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {editId ? 'עדכן' : 'שמור'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400">{error}</div>
      )}

      <div className="rounded-xl border border-border bg-card/30 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center"><Loader2 className="w-8 h-8 animate-spin text-blue-400 mx-auto mb-2" /><span className="text-muted-foreground">{'\u05D8\u05D5\u05E2\u05DF...'}</span></div>
        ) : pageData.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-lg font-medium">{debouncedSearch ? '\u05DC\u05D0 \u05E0\u05DE\u05E6\u05D0\u05D5 \u05E1\u05E4\u05E7\u05D9\u05DD \u05EA\u05D5\u05D0\u05DE\u05D9\u05DD' : '\u05D0\u05D9\u05DF \u05E1\u05E4\u05E7\u05D9\u05DD \u05E2\u05D3\u05D9\u05D9\u05DF'}</p>
            <p className="text-sm mt-1">{'\u05DC\u05D7\u05E5 \u05E2\u05DC "\u05D4\u05D5\u05E1\u05E3 \u05E1\u05E4\u05E7" \u05DC\u05D4\u05EA\u05D7\u05D9\u05DC'}</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground w-12">#</th>
                    <SortHeader field="name" label={'\u05E9\u05DD'} />
                    <SortHeader field="supplier_number" label={'\u05DE\u05E1\u05E4\u05E8'} />
                    <SortHeader field="contact_person" label={'\u05D0\u05D9\u05E9 \u05E7\u05E9\u05E8'} />
                    <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">{'\u05D8\u05DC\u05E4\u05D5\u05DF'}</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">{'\u05D0\u05D9\u05DE\u05D9\u05D9\u05DC'}</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">{'\u05EA\u05E0\u05D0\u05D9 \u05EA\u05E9\u05DC\u05D5\u05DD'}</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">{'\u05E1\u05D8\u05D8\u05D5\u05E1'}</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">{'\u05E4\u05E2\u05D5\u05DC\u05D5\u05EA'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {pageData.map(item => {
                    const active = item.is_active === true || item.is_active === "true" || item.is_active === 1;
                    return (
                      <tr key={item.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3 text-sm text-muted-foreground">{item.id}</td>
                        <td className="px-4 py-3 text-sm text-foreground font-medium">{item.name}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground font-mono">{item.supplier_number}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">{item.contact_person}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground" dir="ltr">{item.phone}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground" dir="ltr">{item.email}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">{PAYMENT_TERMS[item.payment_terms] || item.payment_terms}</td>
                        <td className="px-4 py-3">
                          <Badge variant={active ? "default" : "secondary"} className={active ? "bg-green-500/20 text-green-600 dark:text-green-400" : "bg-muted text-muted-foreground"}>
                            {active ? '\u05E4\u05E2\u05D9\u05DC' : '\u05DC\u05D0 \u05E4\u05E2\u05D9\u05DC'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <button onClick={() => { setForm(item); setEditId(item.id); setShowForm(true); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="p-1.5 hover:bg-muted rounded-lg transition-colors" title={'\u05E2\u05E8\u05D9\u05DB\u05D4'}>
                              <Edit2 className="w-3.5 h-3.5 text-yellow-500" />
                            </button>
                            <button onClick={async () => { const _dup = await duplicateRecord(`${API}/suppliers`, item.id); if (_dup.ok) { load(); } else { alert("שגיאה בשכפול: " + _dup.error); } }} className="p-1.5 hover:bg-muted rounded-lg transition-colors" title="שכפול">
                              <Copy className="w-3.5 h-3.5 text-blue-500" />
                            </button>
                            <button onClick={() => remove(item.id, item.name)} className="p-1.5 hover:bg-muted rounded-lg transition-colors" title={'\u05DE\u05D7\u05D9\u05E7\u05D4'}>
                              <Trash2 className="w-3.5 h-3.5 text-red-500" />
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
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <span className="text-sm text-muted-foreground">{'\u05DE\u05E6\u05D9\u05D2'} {(page-1)*PAGE_SIZE+1}-{Math.min(page*PAGE_SIZE, filtered.length)} {'\u05DE\u05EA\u05D5\u05DA'} {filtered.length}</span>
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
