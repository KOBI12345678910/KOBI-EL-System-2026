import { useState, useEffect, useMemo } from "react";
import { Receipt, Search, Plus, Edit, Trash2, Download, DollarSign, Clock, AlertTriangle, Send, CreditCard, X as XIcon, Copy } from "lucide-react";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import { authFetch } from "@/lib/utils";
import { VAT_RATE } from "@/utils/money";
import { duplicateRecord } from "@/lib/duplicate-record";
import ImportButton from "@/components/import-button";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";

const API = "/api";
const getHeaders = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("erp_token") || ""}` });
const fmt = (n: number) => new Intl.NumberFormat("he-IL").format(n);
const fmtC = (n: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(n);

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft: { label: "טיוטה", color: "bg-muted/20 text-muted-foreground" },
  sent: { label: "נשלח", color: "bg-blue-500/20 text-blue-400" },
  paid: { label: "שולם", color: "bg-green-500/20 text-green-400" },
  overdue: { label: "באיחור", color: "bg-red-500/20 text-red-400" },
  cancelled: { label: "בוטל", color: "bg-muted/20 text-muted-foreground" },
};

type Line = { productName: string; description: string; quantity: number; unitPrice: number; discountPercent: number; lineTotal: number; sortOrder: number };

export default function SalesInvoicing() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showPayment, setShowPayment] = useState<any>(null);
  const [payAmount, setPayAmount] = useState(0);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [lines, setLines] = useState<Line[]>([]);

  const load = () => {
    authFetch(`${API}/sales/invoices`, { headers: getHeaders() }).then(r => r.json()).then(d => setItems(Array.isArray(d) ? d : [])).catch(() => setItems([]));
    authFetch(`${API}/sales/invoices/stats`, { headers: getHeaders() }).then(r => r.json()).then(d => setStats(d || {})).catch(() => {});
  };
  useEffect(load, []);

  const filtered = useMemo(() => {
    return items.filter(r => {
      const s = `${r.invoice_number} ${r.customer_name}`.toLowerCase();
      if (search && !s.includes(search.toLowerCase())) return false;
      if (filterStatus && r.status !== filterStatus) return false;
      return true;
    });
  }, [items, search, filterStatus]);

  const openCreate = () => { setEditing(null); setForm({ status: "draft", invoiceDate: new Date().toISOString().slice(0,10) }); setLines([{ productName: "", description: "", quantity: 1, unitPrice: 0, discountPercent: 0, lineTotal: 0, sortOrder: 0 }]); setShowForm(true); };
  const openEdit = async (r: any) => {
    setEditing(r);
    setForm({ customerId: r.customer_id, customerName: r.customer_name, invoiceDate: r.invoice_date?.slice(0,10), dueDate: r.due_date?.slice(0,10), status: r.status, notes: r.notes, amountPaid: r.amount_paid });
    try {
      const res = await authFetch(`${API}/sales/invoices/${r.id}`, { headers: getHeaders() });
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

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const save = async () => {
    const errors: Record<string, string> = {};
    if (!form.customerId && !form.customerName) errors.customerName = "שדה חובה — יש לבחור לקוח";
    if (!form.invoiceDate) errors.invoiceDate = "שדה חובה — יש להזין תאריך חשבונית";
    if (lines.length === 0 || lines.every(l => !l.productName)) errors.lines = "יש להוסיף לפחות פריט אחד לחשבונית";
    if (Object.keys(errors).length > 0) { setFormErrors(errors); return; }
    setFormErrors({});
    const url = editing ? `${API}/sales/invoices/${editing.id}` : `${API}/sales/invoices`;
    const method = editing ? "PUT" : "POST";
    try {
      const res = await authFetch(url, { method, headers: getHeaders(), body: JSON.stringify({ ...form, lines }) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert("שגיאה בשמירה: " + (e.error || e.message || "שגיאה")); return; }
      setShowForm(false); load();
    } catch (e: any) { alert("שגיאה בשמירה: " + (e.message || "שגיאת רשת")); }
  };

  const sendInvoice = async (id: number) => {
    await authFetch(`${API}/sales/invoices/${id}/send`, { method: "POST", headers: getHeaders(), body: JSON.stringify({}) });
    load();
  };

  const payInvoice = async () => {
    if (!showPayment) return;
    await authFetch(`${API}/sales/invoices/${showPayment.id}/pay`, { method: "POST", headers: getHeaders(), body: JSON.stringify({ amount: payAmount }) });
    setShowPayment(null); load();
  };

  const remove = async (id: number) => { if (!(await globalConfirm("למחוק חשבונית?"))) return; await authFetch(`${API}/sales/invoices/${id}`, { method: "DELETE", headers: getHeaders() }); load(); };

  const exportCSV = () => {
    const csv = ["מספר,לקוח,תאריך,פירעון,סטטוס,סכום,שולם", ...filtered.map(r => `${r.invoice_number},${r.customer_name||""},${r.invoice_date||""},${r.due_date||""},${STATUS_MAP[r.status]?.label||r.status},${r.total||0},${r.amount_paid||0}`)].join("\n");
    const b = new Blob(["\uFEFF"+csv], {type:"text/csv;charset=utf-8"}); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "invoices.csv"; a.click();
  };

  const kpis = [
    { label: "סה\"כ חשבוניות", value: fmt(stats.total || 0), icon: Receipt, color: "text-blue-400" },
    { label: "סה\"כ חיוב", value: fmtC(stats.total_invoiced || 0), icon: DollarSign, color: "text-cyan-400" },
    { label: "נגבה", value: fmtC(stats.total_collected || 0), icon: CreditCard, color: "text-green-400" },
    { label: "יתרה פתוחה", value: fmtC(stats.total_outstanding || 0), icon: Clock, color: "text-amber-400" },
    { label: "באיחור", value: fmt(stats.overdue_count || 0), icon: AlertTriangle, color: "text-red-400" },
    { label: "חיוב החודש", value: fmtC(stats.month_invoiced || 0), icon: DollarSign, color: "text-purple-400" },
  ];

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex justify-between items-center">
        <div><h1 className="text-lg sm:text-2xl font-bold">חשבוניות מכירה</h1><p className="text-sm text-muted-foreground">ניהול חשבוניות, מעקב תשלומים וגיול</p></div>
        <div className="flex gap-2">
          <ImportButton apiRoute="/api/sales/invoices" onSuccess={load} />
          <button onClick={exportCSV} className="btn btn-outline btn-sm flex items-center gap-1"><Download className="w-4 h-4" />ייצוא</button>
          <button onClick={openCreate} className="btn btn-primary btn-sm flex items-center gap-1"><Plus className="w-4 h-4" />חשבונית חדשה</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((k, i) => (<div key={i} className="bg-card border rounded-lg p-3 text-center"><k.icon className={`w-5 h-5 mx-auto mb-1 ${k.color}`} /><div className="text-lg font-bold">{k.value}</div><div className="text-xs text-muted-foreground">{k.label}</div></div>))}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-0 sm:min-w-[200px]"><Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" /><input className="input input-bordered w-full pr-9 h-9 text-sm" placeholder="חיפוש..." value={search} onChange={e => setSearch(e.target.value)} /></div>
        <select className="select select-bordered select-sm" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}><option value="">כל הסטטוסים</option>{Object.entries(STATUS_MAP).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}</select>
      </div>

      <div className="border rounded-lg overflow-auto">
        <table className="table table-sm w-full"><thead><tr className="bg-muted/50">
          <th className="text-right">מספר</th><th className="text-right">לקוח</th><th className="text-right">תאריך</th><th className="text-right">פירעון</th><th className="text-right">סטטוס</th><th className="text-right">סכום</th><th className="text-right">שולם</th><th className="text-right">פעולות</th>
        </tr></thead><tbody>
          {filtered.map(r => (
            <tr key={r.id} className="hover:bg-muted/30">
              <td className="font-mono text-xs">{r.invoice_number}</td>
              <td className="font-medium">{r.customer_name}</td>
              <td>{r.invoice_date?.slice(0,10)}</td>
              <td>{r.due_date?.slice(0,10) || "-"}</td>
              <td><span className={`px-2 py-0.5 rounded text-xs ${STATUS_MAP[r.status]?.color || ""}`}>{STATUS_MAP[r.status]?.label || r.status}</span></td>
              <td>{fmtC(r.total || 0)}</td>
              <td>{fmtC(r.amount_paid || 0)}</td>
              <td><div className="flex gap-1">
                {r.status === 'draft' && <button onClick={() => sendInvoice(r.id)} className="btn btn-ghost btn-xs text-blue-400" title="שלח"><Send className="w-3.5 h-3.5" /></button>}
                {r.status !== 'paid' && r.status !== 'cancelled' && <button onClick={() => { setShowPayment(r); setPayAmount(Number(r.total) - Number(r.amount_paid || 0)); }} className="btn btn-ghost btn-xs text-green-400" title="רשום תשלום"><CreditCard className="w-3.5 h-3.5" /></button>}
                <button onClick={() => openEdit(r)} className="btn btn-ghost btn-xs"><Edit className="w-3.5 h-3.5" /></button>
                <button onClick={async () => { const _dup = await duplicateRecord(`${API}/sales/invoices`, r.id); if (_dup.ok) { load(); } else { alert("שגיאה בשכפול: " + _dup.error); } }} className="btn btn-ghost btn-xs" title="שכפול"><Copy className="w-3.5 h-3.5" /></button>
                <button onClick={() => remove(r.id)} className="btn btn-ghost btn-xs text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
              </div></td>
            </tr>
          ))}
          {filtered.length === 0 && <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">אין חשבוניות להצגה</td></tr>}
        </tbody></table>
      </div>

      {showPayment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowPayment(null)}>
          <div className="bg-card border rounded-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-4">רישום תשלום</h2>
            <p className="text-sm mb-2">חשבונית: {showPayment.invoice_number}</p>
            <p className="text-sm mb-2">סכום חשבונית: {fmtC(showPayment.total || 0)}</p>
            <p className="text-sm mb-4">שולם עד כה: {fmtC(showPayment.amount_paid || 0)}</p>
            <div><label className="text-sm font-medium">סכום תשלום</label><input type="number" className="input input-bordered w-full input-sm" value={payAmount} onChange={e => setPayAmount(Number(e.target.value))} /></div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowPayment(null)} className="btn btn-ghost btn-sm">ביטול</button>
              <button onClick={payInvoice} className="btn btn-primary btn-sm">רשום תשלום</button>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowForm(false)}>
          <div className="bg-card border rounded-xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-4">{editing ? "עריכת חשבונית" : "חשבונית חדשה"}</h2>
            {Object.keys(formErrors).length > 0 && (
              <div className="mb-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400 space-y-1">
                {Object.values(formErrors).map((e, i) => <div key={i}>⚠ {e}</div>)}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div><label className="text-sm font-medium">שם לקוח *</label><input className={`input input-bordered w-full input-sm ${formErrors.customerName ? "border-red-500" : ""}`} value={form.customerName||""} onChange={e => { setForm({...form, customerName: e.target.value}); if (formErrors.customerName) setFormErrors(prev => { const n = {...prev}; delete n.customerName; return n; }); }} />{formErrors.customerName && <p className="text-xs text-red-400 mt-0.5">{formErrors.customerName}</p>}</div>
              <div><label className="text-sm font-medium">סטטוס</label><select className="select select-bordered w-full select-sm" value={form.status||"draft"} onChange={e => setForm({...form, status: e.target.value})}>{Object.entries(STATUS_MAP).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
              <div><label className="text-sm font-medium">תאריך חשבונית *</label><input type="date" className={`input input-bordered w-full input-sm ${formErrors.invoiceDate ? "border-red-500" : ""}`} value={form.invoiceDate||""} onChange={e => { setForm({...form, invoiceDate: e.target.value}); if (formErrors.invoiceDate) setFormErrors(prev => { const n = {...prev}; delete n.invoiceDate; return n; }); }} />{formErrors.invoiceDate && <p className="text-xs text-red-400 mt-0.5">{formErrors.invoiceDate}</p>}</div>
              <div><label className="text-sm font-medium">תאריך פירעון</label><input type="date" className="input input-bordered w-full input-sm" value={form.dueDate||""} onChange={e => setForm({...form, dueDate: e.target.value})} /></div>
              <div><label className="text-sm font-medium">הנחה (₪)</label><input type="number" className="input input-bordered w-full input-sm" value={form.discountAmount||0} onChange={e => setForm({...form, discountAmount: Number(e.target.value)})} min={0} /></div>
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
            {(() => {
              const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
              const discountAmt = Number(form.discountAmount) || 0;
              const vat = (subtotal - discountAmt) * VAT_RATE;
              const total = subtotal - discountAmt + vat;
              return (
                <div className="flex justify-start">
                  <div className="bg-card border border-border/30 rounded-lg p-4 min-w-[280px] space-y-2">
                    <div className="flex justify-between text-sm text-muted-foreground"><span>סה״כ לפני מע״מ</span><span className="font-mono">{fmtC(subtotal)}</span></div>
                    {discountAmt > 0 && <div className="flex justify-between text-sm text-rose-400"><span>הנחה</span><span className="font-mono">-{fmtC(discountAmt)}</span></div>}
                    <div className="flex justify-between text-sm text-amber-400"><span>מע״מ ({Math.round(VAT_RATE * 100)}%)</span><span className="font-mono">{fmtC(vat)}</span></div>
                    <div className="border-t border-border/30 pt-2 flex justify-between text-lg font-bold text-foreground"><span>סה״כ כולל מע״מ</span><span className="font-mono">{fmtC(total)}</span></div>
                  </div>
                </div>
              );
            })()}
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowForm(false)} className="btn btn-ghost btn-sm">ביטול</button>
              <button onClick={save} className="btn btn-primary btn-sm">שמירה</button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <ActivityLog entityType="invoicing" entityId="all" />
        <RelatedRecords entityType="invoicing" entityId="all" />
      </div>
    </div>
  );
}