import { useState, useEffect, useMemo } from "react";
import { FileText, Search, Plus, Edit, Trash2, Download, TrendingUp, DollarSign, ArrowRight, Clock, X as XIcon, CheckCircle, Loader2 } from "lucide-react";
import { globalConfirm } from "@/components/confirm-dialog";
import { authFetch } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import { VAT_RATE } from "@/utils/money";

const API = "/api";
const getHeaders = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("erp_token") || ""}` });
const fmt = (n: number) => new Intl.NumberFormat("he-IL").format(n);
const fmtC = (n: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(n);

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft: { label: "טיוטה", color: "bg-muted/20 text-muted-foreground" },
  sent: { label: "נשלח", color: "bg-blue-500/20 text-blue-400" },
  accepted: { label: "התקבל", color: "bg-green-500/20 text-green-400" },
  rejected: { label: "נדחה", color: "bg-red-500/20 text-red-400" },
  expired: { label: "פג תוקף", color: "bg-amber-500/20 text-amber-400" },
};

type Line = { productName: string; description: string; quantity: number; unitPrice: number; discountPercent: number; lineTotal: number; sortOrder: number };

export default function Quotations() {
  const [items, setItems] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [lines, setLines] = useState<Line[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    Promise.all([
      authFetch(`${API}/sales/quotations`, { headers: getHeaders() }).then(r => r.json()).then(d => setItems(Array.isArray(d) ? d : [])).catch(() => setItems([])),
      authFetch(`${API}/sales/quotations/stats`, { headers: getHeaders() }).then(r => r.json()).then(d => setStats(d || {})).catch(() => {}),
    ]).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const filtered = useMemo(() => {
    return items.filter(r => {
      const s = `${r.quote_number} ${r.customer_name}`.toLowerCase();
      if (search && !s.includes(search.toLowerCase())) return false;
      if (filterStatus && r.status !== filterStatus) return false;
      return true;
    });
  }, [items, search, filterStatus]);

  const openCreate = () => { setEditing(null); setForm({ status: "draft", quoteDate: new Date().toISOString().slice(0,10) }); setLines([{ productName: "", description: "", quantity: 1, unitPrice: 0, discountPercent: 0, lineTotal: 0, sortOrder: 0 }]); setShowForm(true); };
  const openEdit = async (r: any) => {
    setEditing(r);
    setForm({ customerId: r.customer_id, customerName: r.customer_name, quoteDate: r.quote_date?.slice(0,10), validUntil: r.valid_until?.slice(0,10), status: r.status, notes: r.notes });
    try {
      const res = await authFetch(`${API}/sales/quotations/${r.id}`, { headers: getHeaders() });
      const data = await res.json();
      setLines((data.lines || []).map((l: any) => ({ productName: l.product_name, description: l.description || "", quantity: Number(l.quantity), unitPrice: Number(l.unit_price), discountPercent: Number(l.discount_percent), lineTotal: Number(l.line_total), sortOrder: l.sort_order })));
    } catch { setLines([]); }
    setShowForm(true);
  };

  const updateLine = (idx: number, field: string, value: any) => {
    const newLines = [...lines];
    (newLines[idx] as any)[field] = value;
    const l = newLines[idx];
    l.lineTotal = l.quantity * l.unitPrice * (1 - l.discountPercent / 100);
    setLines(newLines);
  };
  const addLine = () => setLines([...lines, { productName: "", description: "", quantity: 1, unitPrice: 0, discountPercent: 0, lineTotal: 0, sortOrder: lines.length }]);
  const removeLine = (idx: number) => setLines(lines.filter((_, i) => i !== idx));

  const save = async () => {
    setSaving(true);
    try {
      const url = editing ? `${API}/sales/quotations/${editing.id}` : `${API}/sales/quotations`;
      const method = editing ? "PUT" : "POST";
      const res = await authFetch(url, { method, headers: getHeaders(), body: JSON.stringify({ ...form, lines }) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.error || "שגיאה בשמירה"); return; }
      setShowForm(false); load();
    } finally { setSaving(false); }
  };

  const convertToOrder = async (id: number) => {
    if (!(await globalConfirm("להמיר הצעה להזמנת מכירה?"))) return;
    await authFetch(`${API}/sales/quotations/${id}/convert`, { method: "POST", headers: getHeaders(), body: JSON.stringify({}) });
    load();
  };

  const remove = async (id: number) => { if (!(await globalConfirm("למחוק הצעה?"))) return; await authFetch(`${API}/sales/quotations/${id}`, { method: "DELETE", headers: getHeaders() }); load(); };

  const exportCSV = () => {
    const csv = ["מספר,לקוח,תאריך,תוקף,סטטוס,סכום", ...filtered.map(r => `${r.quote_number},${r.customer_name||""},${r.quote_date||""},${r.valid_until||""},${STATUS_MAP[r.status]?.label||r.status},${r.total||0}`)].join("\n");
    const b = new Blob(["\uFEFF"+csv], {type:"text/csv;charset=utf-8"}); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "quotations.csv"; a.click();
  };

  const kpis = [
    { label: "סה\"כ הצעות", value: fmt(stats.total || 0), icon: FileText, color: "text-blue-400" },
    { label: "ממתינות", value: fmt(stats.sent || 0), icon: Clock, color: "text-amber-400" },
    { label: "התקבלו", value: fmt(stats.accepted || 0), icon: CheckCircle, color: "text-green-400" },
    { label: "שיעור המרה", value: `${stats.conversion_rate || 0}%`, icon: TrendingUp, color: "text-purple-400" },
    { label: "ערך כולל", value: fmtC(stats.total_value || 0), icon: DollarSign, color: "text-cyan-400" },
    { label: "ערך שהתקבל", value: fmtC(stats.accepted_value || 0), icon: DollarSign, color: "text-emerald-400" },
  ];

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex justify-between items-center">
        <div><h1 className="text-lg sm:text-2xl font-bold">הצעות מחיר</h1><p className="text-sm text-muted-foreground">ניהול הצעות מחיר ללקוחות והמרה להזמנות</p></div>
        <div className="flex gap-2">
          <button onClick={exportCSV} className="btn btn-outline btn-sm flex items-center gap-1"><Download className="w-4 h-4" />ייצוא</button>
          <button onClick={openCreate} className="btn btn-primary btn-sm flex items-center gap-1"><Plus className="w-4 h-4" />הצעה חדשה</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((k, i) => (<div key={i} className="bg-card border rounded-lg p-3 text-center"><k.icon className={`w-5 h-5 mx-auto mb-1 ${k.color}`} /><div className="text-lg font-bold">{k.value}</div><div className="text-xs text-muted-foreground">{k.label}</div></div>))}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-0 sm:min-w-[200px]"><Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" /><input className="input input-bordered w-full pr-9 h-9 text-sm" placeholder="חיפוש..." value={search} onChange={e => setSearch(e.target.value)} /></div>
        <select className="select select-bordered select-sm" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}><option value="">כל הסטטוסים</option>{Object.entries(STATUS_MAP).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}</select>
      </div>

      {loading && <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>}
      {!loading && <div className="border rounded-lg overflow-auto">
        <table className="table table-sm w-full"><thead><tr className="bg-muted/50">
          <th className="text-right">מספר</th><th className="text-right">לקוח</th><th className="text-right">תאריך</th><th className="text-right">תוקף</th><th className="text-right">סטטוס</th><th className="text-right">סכום</th><th className="text-right">פעולות</th>
        </tr></thead><tbody>
          {filtered.map(r => (
            <tr key={r.id} className="hover:bg-muted/30">
              <td className="font-mono text-xs">{r.quote_number}</td>
              <td className="font-medium">{r.customer_name}</td>
              <td>{r.quote_date?.slice(0,10)}</td>
              <td>{r.valid_until?.slice(0,10) || "-"}</td>
              <td><span className={`px-2 py-0.5 rounded text-xs ${STATUS_MAP[r.status]?.color || ""}`}>{STATUS_MAP[r.status]?.label || r.status}</span></td>
              <td>{fmtC(r.total || 0)}</td>
              <td><div className="flex gap-1">
                {(r.status === 'sent' || r.status === 'draft') && <button onClick={() => convertToOrder(r.id)} className="btn btn-ghost btn-xs text-green-400" title="המר להזמנה"><ArrowRight className="w-3.5 h-3.5" /></button>}
                <button onClick={() => openEdit(r)} className="btn btn-ghost btn-xs"><Edit className="w-3.5 h-3.5" /></button>
                <button onClick={() => remove(r.id)} className="btn btn-ghost btn-xs text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
              </div></td>
            </tr>
          ))}
          {filtered.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">אין הצעות מחיר להצגה</td></tr>}
        </tbody></table>
      </div>}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowForm(false)}>
          <div className="bg-card border rounded-xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-4">{editing ? "עריכת הצעה" : "הצעה חדשה"}</h2>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div><label className="text-sm font-medium">שם לקוח *</label><input className="input input-bordered w-full input-sm" value={form.customerName||""} onChange={e => setForm({...form, customerName: e.target.value})} /></div>
              <div><label className="text-sm font-medium">סטטוס</label><select className="select select-bordered w-full select-sm" value={form.status||"draft"} onChange={e => setForm({...form, status: e.target.value})}>{Object.entries(STATUS_MAP).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
              <div><label className="text-sm font-medium">תאריך</label><input type="date" className="input input-bordered w-full input-sm" value={form.quoteDate||""} onChange={e => setForm({...form, quoteDate: e.target.value})} /></div>
              <div><label className="text-sm font-medium">תוקף עד</label><input type="date" className="input input-bordered w-full input-sm" value={form.validUntil||""} onChange={e => setForm({...form, validUntil: e.target.value})} /></div>
              <div className="col-span-2"><label className="text-sm font-medium">הערות</label><textarea className="textarea textarea-bordered w-full text-sm" rows={2} value={form.notes||""} onChange={e => setForm({...form, notes: e.target.value})} /></div>
            </div>
            <h3 className="font-bold mb-2">פריטים</h3>
            <div className="border rounded-lg overflow-auto mb-3">
              <table className="table table-sm w-full"><thead><tr className="bg-muted/50">
                <th className="text-right">מוצר/שירות</th><th className="text-right">תיאור</th><th className="text-right w-20">כמות</th><th className="text-right w-24">מחיר יח׳</th><th className="text-right w-20">הנחה %</th><th className="text-right w-24">סה״כ</th><th className="w-8"></th>
              </tr></thead><tbody>
                {lines.map((l, idx) => (
                  <tr key={idx}>
                    <td><input className="input input-bordered input-sm w-full" value={l.productName} onChange={e => updateLine(idx, "productName", e.target.value)} /></td>
                    <td><input className="input input-bordered input-sm w-full" value={l.description} onChange={e => updateLine(idx, "description", e.target.value)} /></td>
                    <td><input type="number" className="input input-bordered input-sm w-full" value={l.quantity} onChange={e => updateLine(idx, "quantity", Number(e.target.value))} /></td>
                    <td><input type="number" className="input input-bordered input-sm w-full" value={l.unitPrice} onChange={e => updateLine(idx, "unitPrice", Number(e.target.value))} /></td>
                    <td><input type="number" className="input input-bordered input-sm w-full" value={l.discountPercent} onChange={e => updateLine(idx, "discountPercent", Number(e.target.value))} /></td>
                    <td className="font-medium">{fmtC(l.lineTotal)}</td>
                    <td><button onClick={() => removeLine(idx)} className="btn btn-ghost btn-xs text-red-400"><XIcon className="w-3.5 h-3.5" /></button></td>
                  </tr>
                ))}
              </tbody></table>
            </div>
            <button onClick={addLine} className="btn btn-outline btn-sm mb-3"><Plus className="w-3.5 h-3.5 mr-1" />הוסף שורה</button>
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 mt-3">
              <h3 className="text-sm font-bold text-purple-800 mb-3 flex items-center gap-2"><DollarSign className="w-4 h-4" /> סיכום + מע״מ 18%</h3>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="bg-card rounded-lg p-3 text-center border"><div className="text-xs text-muted-foreground mb-1">סכום לפני מע״מ</div><div className="text-lg font-bold text-foreground">{fmtC(lines.reduce((s, l) => s + l.lineTotal, 0))}</div></div>
                <div className="bg-card rounded-lg p-3 text-center border border-purple-300"><div className="text-xs text-purple-600 mb-1">מע״מ 18%</div><div className="text-lg font-bold text-purple-700">{fmtC(Math.round(lines.reduce((s, l) => s + l.lineTotal, 0) * VAT_RATE * 100) / 100)}</div></div>
                <div className="bg-purple-600 rounded-lg p-3 text-center"><div className="text-xs text-purple-100 mb-1">סה״כ כולל מע״מ</div><div className="text-lg font-bold text-white">{fmtC(Math.round(lines.reduce((s, l) => s + l.lineTotal, 0) * 1.18 * 100) / 100)}</div></div>
              </div>
            </div>

            <div className="mt-4 flex justify-start">
              <div className="bg-[#1a1f2e] border border-border/30 rounded-lg p-4 min-w-[280px] space-y-2">
                {(() => {
                  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
                  const vat = subtotal * VAT_RATE;
                  const total = subtotal + vat;
                  return (
                    <>
                      <div className="flex justify-between text-sm text-muted-foreground"><span>סה״כ לפני מע״מ</span><span className="font-mono">{fmtC(subtotal)}</span></div>
                      <div className="flex justify-between text-sm text-amber-400"><span>מע״מ (18%)</span><span className="font-mono">{fmtC(vat)}</span></div>
                      <div className="border-t border-border/30 pt-2 flex justify-between text-lg font-bold text-white"><span>סה״כ כולל מע״מ</span><span className="font-mono">{fmtC(total)}</span></div>
                    </>
                  );
                })()}
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowForm(false)} disabled={saving} className="btn btn-ghost btn-sm">ביטול</button>
              <button onClick={save} disabled={saving} className="btn btn-primary btn-sm flex items-center gap-1">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}{saving ? "שומר..." : "שמירה"}</button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <ActivityLog entityType="quotations" entityId="all" />
        <RelatedRecords entityType="quotations" entityId="all" />
      </div>
    </div>
  );
}