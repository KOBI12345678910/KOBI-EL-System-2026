import { LoadingOverlay } from "@/components/ui/unified-states";
import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { authFetch } from "@/lib/utils";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import {
  Trash2, Plus, Search, Download, Edit2, Eye, X, Save, AlertCircle,
  ArrowUpDown, RefreshCw
} from "lucide-react";
import { EmptyState } from "@/components/ui/unified-states";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);

const WASTE_TYPES = ["מסוכן", "לא מסוכן", "למיחזור", "אורגני", "אלקטרוני", "בנייה"];
const DISPOSAL_METHODS = ["פינוי מורשה", "מיחזור", "הטמנה", "שריפה מבוקרת", "טיפול מיוחד"];
const STATUS_LIST = ["פעיל", "מלא", "בפינוי", "ארכיון"];
const SC: Record<string, string> = {
  "פעיל": "bg-green-500/20 text-green-300",
  "מלא": "bg-yellow-500/20 text-yellow-300",
  "בפינוי": "bg-blue-500/20 text-blue-300",
  "ארכיון": "bg-gray-500/20 text-gray-300",
};
const WT: Record<string, string> = {
  "מסוכן": "bg-red-500/20 text-red-300",
  "לא מסוכן": "bg-gray-500/20 text-gray-300",
  "למיחזור": "bg-green-500/20 text-green-300",
  "אורגני": "bg-lime-500/20 text-lime-300",
  "אלקטרוני": "bg-blue-500/20 text-blue-300",
  "בנייה": "bg-orange-500/20 text-orange-300",
};

interface WasteRecord {
  id: number;
  waste_type: string;
  quantity_kg: number;
  disposal_method: string;
  transporter_name: string;
  transporter_license: string;
  disposal_date: string;
  location: string;
  container_id: string;
  notes: string;
  status: string;
  created_at: string;
}

const EMPTY_FORM = { waste_type: "לא מסוכן", quantity_kg: "", disposal_method: "פינוי מורשה", transporter_name: "", transporter_license: "", disposal_date: new Date().toISOString().slice(0,10), location: "", container_id: "", notes: "", status: "פעיל" };

export default function WasteManagement() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<WasteRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [sortField, setSortField] = useState("disposal_date");
  const [sortDir, setSortDir] = useState<"asc"|"desc">("desc");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<WasteRecord | null>(null);
  const [viewDetail, setViewDetail] = useState<WasteRecord | null>(null);
  const [form, setForm] = useState<any>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const pagination = useSmartPagination(25);
  const validation = useFormValidation<{ quantity_kg: string }>({
    quantity_kg: { required: true, message: "כמות חובה" },
  });

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const r = await authFetch(`${API}/hse-waste-disposal?limit=500`);
      if (r.ok) setItems(safeArray(await r.json()));
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let data = items.filter(r =>
      (filterStatus === "all" || r.status === filterStatus) &&
      (filterType === "all" || r.waste_type === filterType) &&
      (!search || [r.waste_type, r.transporter_name, r.container_id, r.location].some(f => f?.toLowerCase().includes(search.toLowerCase())))
    );
    data.sort((a: any, b: any) => {
      const va = a[sortField] ?? ""; const vb = b[sortField] ?? "";
      const c = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "he");
      return sortDir === "asc" ? c : -c;
    });
    pagination.setTotalItems(data.length);
    return data;
  }, [items, search, filterStatus, filterType, sortField, sortDir]);

  const toggleSort = (f: string) => { if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField(f); setSortDir("desc"); } };

  const openCreate = () => { setEditing(null); setForm({ ...EMPTY_FORM }); validation.clearErrors(); setShowForm(true); };
  const openEdit = (r: WasteRecord) => {
    setEditing(r);
    setForm({ waste_type: r.waste_type, quantity_kg: r.quantity_kg, disposal_method: r.disposal_method, transporter_name: r.transporter_name, transporter_license: r.transporter_license, disposal_date: r.disposal_date?.slice(0,10), location: r.location, container_id: r.container_id, notes: r.notes, status: r.status });
    validation.clearErrors();
    setShowForm(true);
  };

  const save = async () => {
    if (!validation.validate(form)) return;
    setSaving(true);
    try {
      const url = editing ? `${API}/hse-waste-disposal/${editing.id}` : `${API}/hse-waste-disposal`;
      await authFetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setShowForm(false); load();
    } catch {}
    setSaving(false);
  };

  const remove = async (id: number) => {
    if (await globalConfirm("למחוק רשומת פסולת?")) { await authFetch(`${API}/hse-waste-disposal/${id}`, { method: "DELETE" }); load(); }
  };

  const stats = useMemo(() => ({
    totalKg: items.reduce((s, r) => s + safeNum(r.quantity_kg), 0),
    hazardous: items.filter(r => r.waste_type === "מסוכן").length,
    recycled: items.filter(r => r.waste_type === "למיחזור").length,
    active: items.filter(r => r.status === "פעיל").length,
  }), [items]);

  const fmtKg = (v: number) => v >= 1000 ? `${(v/1000).toFixed(1)} ט׳` : `${v.toFixed(0)} ק"ג`;

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2"><Trash2 className="w-6 h-6 text-orange-400" />ניהול פסולת ומיחזור</h1>
          <p className="text-sm text-muted-foreground mt-1">מעקב סוגי פסולת, כמויות, שיטות סילוק ומובילים מורשים</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={load} className="flex items-center gap-1 px-3 py-2 bg-card border border-border rounded-lg text-sm hover:bg-muted"><RefreshCw className="w-3.5 h-3.5" /></button>
          <button onClick={openCreate} className="flex items-center gap-2 bg-orange-600 text-foreground px-4 py-2 rounded-xl hover:bg-orange-700 text-sm font-medium"><Plus className="w-4 h-4" />הוסף רשומה</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card/50 border-border/50"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-foreground">{fmtKg(stats.totalKg)}</p><p className="text-xs text-muted-foreground mt-1">סה"כ פסולת</p></CardContent></Card>
        <Card className="bg-card/50 border-border/50"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-red-400">{stats.hazardous}</p><p className="text-xs text-muted-foreground mt-1">פסולת מסוכנת</p></CardContent></Card>
        <Card className="bg-card/50 border-border/50"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-green-400">{stats.recycled}</p><p className="text-xs text-muted-foreground mt-1">למיחזור</p></CardContent></Card>
        <Card className="bg-card/50 border-border/50"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-blue-400">{stats.active}</p><p className="text-xs text-muted-foreground mt-1">מכולות פעילות</p></CardContent></Card>
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-0 max-w-md"><Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש לפי סוג, קבלן, מיכל..." className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" /></div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל הסטטוסים</option>
          {STATUS_LIST.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל הסוגים</option>
          {WASTE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="text-sm text-muted-foreground">{filtered.length} רשומות</span>
      </div>

      {loading ? (
        <LoadingOverlay className="min-h-[100px] border border-border/50 rounded-2xl bg-card/50" />
      ) : error ? (
        <div className="text-center py-12 text-red-400"><AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>{error}</p><button onClick={load} className="mt-3 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm">נסה שנית</button></div>
      ) : filtered.length === 0 ? (
        <EmptyState
          variant="file"
          title="אין רשומות פסולת"
          description='לא נמצאו רשומות תואמות לסינון הנוכחי. לחץ "הוסף רשומה" כדי להתחיל.'
          action={{ label: "הוסף רשומה", onClick: openCreate }}
        />
      ) : (
        <>
          <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><div className="overflow-x-auto">
            <table className="w-full text-sm"><thead className="bg-muted/30 border-b border-border/50"><tr>
              {[["waste_type","סוג פסולת"],["quantity_kg","כמות"],["disposal_method","שיטת סילוק"],["transporter_name","מוביל"],["disposal_date","תאריך סילוק"],["container_id","מיכל"],["status","סטטוס"]].map(([f,l]) => (
                <th key={f} onClick={() => toggleSort(f)} className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground">
                  <div className="flex items-center gap-1">{l}<ArrowUpDown className="w-3 h-3" /></div>
                </th>
              ))}
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
            </tr></thead><tbody>
              {pagination.paginate(filtered).map(r => (
                <tr key={r.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3"><Badge className={`text-[10px] ${WT[r.waste_type] || ""}`}>{r.waste_type}</Badge></td>
                  <td className="px-4 py-3 font-medium">{safeNum(r.quantity_kg) >= 1000 ? `${(safeNum(r.quantity_kg)/1000).toFixed(1)} ט׳` : `${safeNum(r.quantity_kg)} ק"ג`}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.disposal_method || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.transporter_name || "—"}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{r.disposal_date?.slice(0,10) || "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{r.container_id || "—"}</td>
                  <td className="px-4 py-3"><Badge className={`text-[10px] ${SC[r.status] || ""}`}>{r.status}</Badge></td>
                  <td className="px-4 py-3"><div className="flex gap-1">
                    <button onClick={() => setViewDetail(r)} className="p-1.5 hover:bg-muted rounded-lg"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                    <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
                    {isSuperAdmin && <button onClick={async () => { if (await globalConfirm(`למחוק?`)) remove(r.id); }} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>}
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
            <div className="p-5 border-b border-border flex justify-between items-center"><h2 className="text-lg font-bold text-foreground">פרטי רשומת פסולת</h2><button onClick={() => setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button></div>
            <div className="p-5 grid grid-cols-2 gap-4 text-sm">
              {[["סוג פסולת", viewDetail.waste_type], ["כמות", `${viewDetail.quantity_kg} ק"ג`], ["שיטת סילוק", viewDetail.disposal_method], ["מוביל", viewDetail.transporter_name], ["רישיון מוביל", viewDetail.transporter_license], ["תאריך סילוק", viewDetail.disposal_date?.slice(0,10)], ["מיכל/מכולה", viewDetail.container_id], ["מיקום", viewDetail.location], ["סטטוס", viewDetail.status]].map(([l, v]) => (
                <div key={l}><p className="text-xs text-muted-foreground mb-0.5">{l}</p><p className="font-medium text-foreground">{v || "—"}</p></div>
              ))}
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
            <div className="p-5 border-b border-border flex justify-between items-center"><h2 className="text-lg font-bold text-foreground">{editing ? "עריכת רשומת פסולת" : "הוספת רשומת פסולת"}</h2><button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button></div>
            <div className="p-5 grid grid-cols-2 gap-4">
              <div><label className="block text-xs text-muted-foreground mb-1.5">סוג פסולת</label><select value={form.waste_type} onChange={e => setForm({...form, waste_type: e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{WASTE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
              <div><label className="block text-xs text-muted-foreground mb-1.5">כמות (ק"ג) <RequiredMark /></label><input type="number" value={form.quantity_kg} onChange={e => setForm({...form, quantity_kg: e.target.value})} className={`w-full bg-background border rounded-xl px-3 py-2.5 text-sm ${validation.errors.quantity_kg ? "border-red-500" : "border-border"}`} /><FormFieldError error={validation.errors.quantity_kg} /></div>
              <div><label className="block text-xs text-muted-foreground mb-1.5">שיטת סילוק</label><select value={form.disposal_method} onChange={e => setForm({...form, disposal_method: e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{DISPOSAL_METHODS.map(m => <option key={m} value={m}>{m}</option>)}</select></div>
              <div><label className="block text-xs text-muted-foreground mb-1.5">תאריך סילוק</label><input type="date" value={form.disposal_date} onChange={e => setForm({...form, disposal_date: e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              <div><label className="block text-xs text-muted-foreground mb-1.5">שם המוביל המורשה</label><input value={form.transporter_name} onChange={e => setForm({...form, transporter_name: e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              <div><label className="block text-xs text-muted-foreground mb-1.5">מספר רישיון מוביל</label><input value={form.transporter_license} onChange={e => setForm({...form, transporter_license: e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              <div><label className="block text-xs text-muted-foreground mb-1.5">מיכל / מכולה</label><input value={form.container_id} onChange={e => setForm({...form, container_id: e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              <div><label className="block text-xs text-muted-foreground mb-1.5">מיקום</label><input value={form.location} onChange={e => setForm({...form, location: e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              <div><label className="block text-xs text-muted-foreground mb-1.5">סטטוס</label><select value={form.status} onChange={e => setForm({...form, status: e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{STATUS_LIST.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
              <div className="col-span-2"><label className="block text-xs text-muted-foreground mb-1.5">הערות</label><textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} rows={2} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
            </div>
            <div className="p-5 border-t border-border flex justify-end gap-2">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">ביטול</button>
              <button onClick={save} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-foreground rounded-lg text-sm hover:bg-orange-700">
                {saving ? "שומר..." : <><Save className="w-3.5 h-3.5" />שמור</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function safeNum(v: any, def = 0) { return Number(v ?? def) || def; }
