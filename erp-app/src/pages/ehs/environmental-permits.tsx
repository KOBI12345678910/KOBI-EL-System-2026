import { LoadingOverlay } from "@/components/ui/unified-states";
import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { authFetch } from "@/lib/utils";
import { translateStatus } from "@/lib/status-labels";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import {
  FileCheck, Plus, Search, Edit2, Eye, X, Save, AlertCircle,
  ArrowUpDown, RefreshCw, AlertTriangle, CheckCircle2, Clock
} from "lucide-react";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);

const PERMIT_TYPES = ["רישיון עסק", "היתר פליטות", "היתר רעלים", "היתר פסולת", "היתר שפכים", "אחר"];
const AUTHORITIES = ["משרד הסביבה", "רשות המקומית", "המשרד לאיכות הסביבה", "משרד הבריאות", "כיבוי אש", "אחר"];
const STATUS_LIST = ["תקף", "מתחדש", "פג תוקף", "בהליך", "בוטל"];

const SC: Record<string, string> = {
  "תקף": "bg-green-500/20 text-green-300",
  "מתחדש": "bg-blue-500/20 text-blue-300",
  "פג תוקף": "bg-red-500/20 text-red-300",
  "בהליך": "bg-yellow-500/20 text-yellow-300",
  "בוטל": "bg-gray-500/20 text-gray-300",
};

interface EnvPermit {
  id: number;
  permit_number: string;
  permit_type: string;
  issuing_authority: string;
  issue_date: string;
  expiry_date: string;
  status: string;
  conditions: string;
  renewal_lead_days: number;
  responsible_person: string;
  notes: string;
  created_at: string;
}

const EMPTY_FORM = {
  permit_number: "", permit_type: "רישיון עסק", issuing_authority: "משרד הסביבה",
  issue_date: "", expiry_date: "", status: "תקף", conditions: "",
  renewal_lead_days: 90, responsible_person: "", notes: ""
};

function daysUntilExpiry(dateStr: string): number {
  if (!dateStr) return 9999;
  return Math.floor((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

export default function EnvironmentalPermits() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<EnvPermit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [sortField, setSortField] = useState("expiry_date");
  const [sortDir, setSortDir] = useState<"asc"|"desc">("asc");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<EnvPermit | null>(null);
  const [viewDetail, setViewDetail] = useState<EnvPermit | null>(null);
  const [form, setForm] = useState<any>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const pagination = useSmartPagination(25);
  const validation = useFormValidation<{ permit_number: string; expiry_date: string }>({
    permit_number: { required: true, message: "מספר היתר חובה" },
    expiry_date: { required: true, message: "תאריך פקיעה חובה" },
  });

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const r = await authFetch(`${API}/hse-environmental-permits?limit=500`);
      if (r.ok) setItems(safeArray(await r.json()));
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let data = items.filter(r =>
      (filterStatus === "all" || r.status === filterStatus) &&
      (filterType === "all" || r.permit_type === filterType) &&
      (!search || [r.permit_number, r.permit_type, r.issuing_authority, r.responsible_person].some(f => f?.toLowerCase().includes(search.toLowerCase())))
    );
    data.sort((a: any, b: any) => {
      const va = a[sortField] ?? ""; const vb = b[sortField] ?? "";
      const c = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "he");
      return sortDir === "asc" ? c : -c;
    });
    pagination.setTotalItems(data.length);
    return data;
  }, [items, search, filterStatus, filterType, sortField, sortDir]);

  const toggleSort = (f: string) => { if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField(f); setSortDir("asc"); } };

  const openCreate = () => { setEditing(null); setForm({ ...EMPTY_FORM }); validation.clearErrors(); setShowForm(true); };
  const openEdit = (r: EnvPermit) => {
    setEditing(r);
    setForm({ permit_number: r.permit_number, permit_type: r.permit_type, issuing_authority: r.issuing_authority, issue_date: r.issue_date?.slice(0,10), expiry_date: r.expiry_date?.slice(0,10), status: r.status, conditions: r.conditions, renewal_lead_days: r.renewal_lead_days, responsible_person: r.responsible_person, notes: r.notes });
    validation.clearErrors();
    setShowForm(true);
  };

  const save = async () => {
    if (!validation.validate(form)) return;
    setSaving(true);
    try {
      const url = editing ? `${API}/hse-environmental-permits/${editing.id}` : `${API}/hse-environmental-permits`;
      await authFetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setShowForm(false); load();
    } catch {}
    setSaving(false);
  };

  const stats = useMemo(() => {
    const now = Date.now();
    const expiring30 = items.filter(r => {
      const d = daysUntilExpiry(r.expiry_date);
      return d >= 0 && d <= 30 && r.status === "תקף";
    }).length;
    const expiring90 = items.filter(r => {
      const d = daysUntilExpiry(r.expiry_date);
      return d > 30 && d <= 90 && r.status === "תקף";
    }).length;
    return {
      total: items.length,
      valid: items.filter(r => r.status === "תקף").length,
      expired: items.filter(r => r.status === "פג תוקף").length,
      expiring30,
      expiring90,
    };
  }, [items]);

  const getExpiryBadge = (r: EnvPermit) => {
    const days = daysUntilExpiry(r.expiry_date);
    if (r.status === "פג תוקף" || days < 0) return <span className="text-xs text-red-400 font-medium">פג תוקף</span>;
    if (days <= 30) return <span className="text-xs text-red-400 font-medium">⚠ {days} ימים</span>;
    if (days <= 90) return <span className="text-xs text-yellow-400 font-medium">⚡ {days} ימים</span>;
    return <span className="text-xs text-green-400">{days} ימים</span>;
  };

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2"><FileCheck className="w-6 h-6 text-blue-400" />היתרים סביבתיים</h1>
          <p className="text-sm text-muted-foreground mt-1">רישיונות עסק, היתרי פליטות ורעלים — מרשם ומעקב תוקף</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={load} className="flex items-center gap-1 px-3 py-2 bg-card border border-border rounded-lg text-sm hover:bg-muted"><RefreshCw className="w-3.5 h-3.5" /></button>
          <button onClick={openCreate} className="flex items-center gap-2 bg-blue-600 text-foreground px-4 py-2 rounded-xl hover:bg-blue-700 text-sm font-medium"><Plus className="w-4 h-4" />הוסף היתר</button>
        </div>
      </div>

      {stats.expiring30 > 0 && (
        <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <p className="text-sm font-medium">{stats.expiring30} היתרים פגים תוקף תוך 30 יום — נדרשת חידוש דחוף!</p>
        </div>
      )}
      {stats.expiring90 > 0 && (
        <div className="flex items-center gap-3 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl text-yellow-400">
          <Clock className="w-5 h-5 shrink-0" />
          <p className="text-sm">{stats.expiring90} היתרים פגים תוקף תוך 90 יום — יש לתכנן חידוש</p>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card/50 border-border/50"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-foreground">{stats.total}</p><p className="text-xs text-muted-foreground mt-1">סה"כ היתרים</p></CardContent></Card>
        <Card className="bg-card/50 border-border/50"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-green-400">{stats.valid}</p><p className="text-xs text-muted-foreground mt-1">בתוקף</p></CardContent></Card>
        <Card className="bg-card/50 border-border/50"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-yellow-400">{stats.expiring90}</p><p className="text-xs text-muted-foreground mt-1">מתחדשים בקרוב</p></CardContent></Card>
        <Card className="bg-card/50 border-border/50"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-red-400">{stats.expired}</p><p className="text-xs text-muted-foreground mt-1">פג תוקף</p></CardContent></Card>
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-0 max-w-md"><Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש לפי מספר, סוג, רשות..." className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" /></div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל הסטטוסים</option>
          {STATUS_LIST.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל הסוגים</option>
          {PERMIT_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="text-sm text-muted-foreground">{filtered.length} היתרים</span>
      </div>

      {loading ? (
        <LoadingOverlay className="min-h-[100px]" />
      ) : error ? (
        <div className="text-center py-12 text-red-400"><AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>{error}</p></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground"><FileCheck className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="font-medium">אין היתרים</p></div>
      ) : (
        <>
          <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><div className="overflow-x-auto">
            <table className="w-full text-sm"><thead className="bg-muted/30 border-b border-border/50"><tr>
              {[["permit_number","מספר היתר"],["permit_type","סוג"],["issuing_authority","רשות מנפיקה"],["issue_date","תאריך הנפקה"],["expiry_date","תאריך פקיעה"],["responsible_person","אחראי"],["status","סטטוס"]].map(([f,l]) => (
                <th key={f} onClick={() => toggleSort(f)} className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground">
                  <div className="flex items-center gap-1">{l}<ArrowUpDown className="w-3 h-3" /></div>
                </th>
              ))}
              <th className="px-4 py-3 text-xs font-medium text-muted-foreground text-right">ימים לפקיעה</th>
              <th className="px-4 py-3 text-xs font-medium text-muted-foreground text-right">פעולות</th>
            </tr></thead><tbody>
              {pagination.paginate(filtered).map(r => (
                <tr key={r.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-blue-400 font-bold">{r.permit_number || `#${r.id}`}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.permit_type}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.issuing_authority}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{r.issue_date?.slice(0,10) || "—"}</td>
                  <td className="px-4 py-3 text-xs font-medium">{r.expiry_date?.slice(0,10) || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.responsible_person || "—"}</td>
                  <td className="px-4 py-3"><Badge className={`text-[10px] ${SC[r.status] || ""}`}>{translateStatus(r.status)}</Badge></td>
                  <td className="px-4 py-3">{getExpiryBadge(r)}</td>
                  <td className="px-4 py-3"><div className="flex gap-1">
                    <button onClick={() => setViewDetail(r)} className="p-1.5 hover:bg-muted rounded-lg"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                    <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
                    <button onClick={async () => { if (await globalConfirm("למחוק היתר?")) { await authFetch(`${API}/hse-environmental-permits/${r.id}`, { method: "DELETE" }); load(); } }} className="p-1.5 hover:bg-muted rounded-lg"><AlertCircle className="w-3.5 h-3.5 text-red-400" /></button>
                  </div></td>
                </tr>
              ))}
            </tbody></table>
          </div></div>
          <SmartPagination pagination={pagination} />
        </>
      )}

      {viewDetail && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setViewDetail(null)}>
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-border flex justify-between items-center"><h2 className="text-lg font-bold text-foreground flex items-center gap-2"><FileCheck className="w-5 h-5 text-blue-400" />{viewDetail.permit_number || `היתר #${viewDetail.id}`}</h2><button onClick={() => setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button></div>
            <div className="p-5 grid grid-cols-2 gap-4 text-sm">
              {[["סוג היתר", viewDetail.permit_type], ["רשות מנפיקה", viewDetail.issuing_authority], ["תאריך הנפקה", viewDetail.issue_date?.slice(0,10)], ["תאריך פקיעה", viewDetail.expiry_date?.slice(0,10)], ["אחראי", viewDetail.responsible_person], ["ימי התראה לחידוש", `${viewDetail.renewal_lead_days} ימים`], ["סטטוס", viewDetail.status]].map(([l,v]) => (
                <div key={l}><p className="text-xs text-muted-foreground mb-0.5">{l}</p><p className="font-medium text-foreground">{v || "—"}</p></div>
              ))}
              <div className="col-span-2"><p className="text-xs text-muted-foreground mb-0.5">תנאים</p><p className="text-foreground">{viewDetail.conditions || "—"}</p></div>
              <div className="col-span-2"><p className="text-xs text-muted-foreground mb-0.5">הערות</p><p className="text-foreground">{viewDetail.notes || "—"}</p></div>
            </div>
            <div className="p-5 border-t border-border flex justify-end gap-2">
              <button onClick={() => { setViewDetail(null); openEdit(viewDetail); }} className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg text-sm hover:bg-blue-500/30"><Edit2 className="w-3.5 h-3.5 inline ml-1" />עריכה</button>
              <button onClick={() => setViewDetail(null)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">סגור</button>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-border flex justify-between items-center"><h2 className="text-lg font-bold text-foreground">{editing ? "עריכת היתר" : "הוספת היתר סביבתי"}</h2><button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button></div>
            <div className="p-5 grid grid-cols-2 gap-4">
              <div><label className="block text-xs text-muted-foreground mb-1.5">מספר היתר <RequiredMark /></label><input value={form.permit_number} onChange={e => setForm({...form, permit_number: e.target.value})} className={`w-full bg-background border rounded-xl px-3 py-2.5 text-sm ${validation.errors.permit_number ? "border-red-500" : "border-border"}`} /><FormFieldError error={validation.errors.permit_number} /></div>
              <div><label className="block text-xs text-muted-foreground mb-1.5">סוג היתר</label><select value={form.permit_type} onChange={e => setForm({...form, permit_type: e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{PERMIT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
              <div><label className="block text-xs text-muted-foreground mb-1.5">רשות מנפיקה</label><select value={form.issuing_authority} onChange={e => setForm({...form, issuing_authority: e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{AUTHORITIES.map(a => <option key={a} value={a}>{a}</option>)}</select></div>
              <div><label className="block text-xs text-muted-foreground mb-1.5">אחראי</label><input value={form.responsible_person} onChange={e => setForm({...form, responsible_person: e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              <div><label className="block text-xs text-muted-foreground mb-1.5">תאריך הנפקה</label><input type="date" value={form.issue_date} onChange={e => setForm({...form, issue_date: e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              <div><label className="block text-xs text-muted-foreground mb-1.5">תאריך פקיעה <RequiredMark /></label><input type="date" value={form.expiry_date} onChange={e => setForm({...form, expiry_date: e.target.value})} className={`w-full bg-background border rounded-xl px-3 py-2.5 text-sm ${validation.errors.expiry_date ? "border-red-500" : "border-border"}`} /><FormFieldError error={validation.errors.expiry_date} /></div>
              <div><label className="block text-xs text-muted-foreground mb-1.5">ימי התראה לחידוש</label><input type="number" value={form.renewal_lead_days} onChange={e => setForm({...form, renewal_lead_days: e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              <div><label className="block text-xs text-muted-foreground mb-1.5">סטטוס</label><select value={form.status} onChange={e => setForm({...form, status: e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{STATUS_LIST.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
              <div className="col-span-2"><label className="block text-xs text-muted-foreground mb-1.5">תנאים ומגבלות</label><textarea value={form.conditions} onChange={e => setForm({...form, conditions: e.target.value})} rows={2} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              <div className="col-span-2"><label className="block text-xs text-muted-foreground mb-1.5">הערות</label><textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} rows={2} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
            </div>
            <div className="p-5 border-t border-border flex justify-end gap-2">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">ביטול</button>
              <button onClick={save} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-foreground rounded-lg text-sm hover:bg-blue-700">
                {saving ? "שומר..." : <><Save className="w-3.5 h-3.5" />שמור</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
