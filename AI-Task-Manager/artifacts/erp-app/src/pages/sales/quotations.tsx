import { useState, useEffect, useMemo, useRef } from "react";
import {
  FileText, Search, Plus, Edit, Trash2, Download, TrendingUp, DollarSign,
  ArrowRight, Clock, X as XIcon, CheckCircle, Loader2, GripVertical,
  AlertTriangle, Tag, Send, ExternalLink, RefreshCw, Info, Copy, Upload
} from "lucide-react";
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
  accepted: { label: "התקבל", color: "bg-green-500/20 text-green-400" },
  rejected: { label: "נדחה", color: "bg-red-500/20 text-red-400" },
  expired: { label: "פג תוקף", color: "bg-amber-500/20 text-amber-400" },
  pending_approval: { label: "ממתין לאישור", color: "bg-purple-500/20 text-purple-400" },
  approved: { label: "אושר", color: "bg-green-500/20 text-green-400" },
  approval_rejected: { label: "הנחה נדחתה", color: "bg-red-500/20 text-red-400" },
};

type Line = {
  productName: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  lineTotal: number;
  sortOrder: number;
  appliedRule?: string;
  resolving?: boolean;
};

export default function Quotations() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
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
  const [approvals, setApprovals] = useState<any[]>([]);
  const [showApprovals, setShowApprovals] = useState(false);
  const [customers, setCustomers] = useState<any[]>([]);
  const [productCatalog, setProductCatalog] = useState<Array<{ name: string; code: string; defaultPrice: number | null }>>([]);
  const [activeSuggestIdx, setActiveSuggestIdx] = useState<number | null>(null);
  const [discountThreshold, setDiscountThreshold] = useState<number>(15);
  const [deliveryModal, setDeliveryModal] = useState<{ quoteId: number | null; date: string }>({ quoteId: null, date: "" });

  const dragIdx = useRef<number | null>(null);
  const dragOverIdx = useRef<number | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      authFetch(`${API}/sales/quotations`, { headers: getHeaders() }).then(r => r.json()).then(d => setItems(Array.isArray(d) ? d : [])).catch(() => setItems([])),
      authFetch(`${API}/sales/quotations/stats`, { headers: getHeaders() }).then(r => r.json()).then(d => setStats(d || {})).catch(() => {}),
      authFetch(`${API}/quote-builder/discount-approvals`, { headers: getHeaders() }).then(r => r.json()).then(d => setApprovals(Array.isArray(d) ? d : [])).catch(() => {}),
      authFetch(`${API}/sales/customers`, { headers: getHeaders() }).then(r => r.json()).then(d => setCustomers(Array.isArray(d) ? d : [])).catch(() => {}),
      authFetch(`${API}/quote-builder/settings`, { headers: getHeaders() }).then(r => r.json()).then(d => {
        if (typeof d?.discountApprovalThreshold === "number") setDiscountThreshold(d.discountApprovalThreshold);
      }).catch(() => {}),
      authFetch(`${API}/quote-builder/products`, { headers: getHeaders() }).then(r => r.json()).then(d => {
        if (Array.isArray(d)) setProductCatalog(d);
      }).catch(() => {}),
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

  const openCreate = () => {
    setEditing(null);
    setForm({ status: "draft", quoteDate: new Date().toISOString().slice(0, 10) });
    setLines([{ productName: "", description: "", quantity: 1, unitPrice: 0, discountPercent: 0, lineTotal: 0, sortOrder: 0 }]);
    setShowForm(true);
  };

  const validateQuoteForm = () => {
    if (!form.customerName?.trim()) {
      alert("יש לבחור לקוח");
      return false;
    }
    return true;
  };

  const openEdit = async (r: any) => {
    setEditing(r);
    setForm({
      customerId: r.customer_id,
      customerName: r.customer_name,
      quoteDate: r.quote_date?.slice(0, 10),
      validUntil: r.valid_until?.slice(0, 10),
      status: r.status,
      notes: r.notes
    });
    try {
      const res = await authFetch(`${API}/sales/quotations/${r.id}`, { headers: getHeaders() });
      const data = await res.json();
      setLines((data.lines || []).map((l: any, i: number) => ({
        productName: l.product_name,
        description: l.description || "",
        quantity: Number(l.quantity),
        unitPrice: Number(l.unit_price),
        discountPercent: Number(l.discount_percent),
        lineTotal: Number(l.line_total),
        sortOrder: l.sort_order ?? i,
      })));
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

  // When a product is selected from the catalog datalist, pre-fill price from catalog default
  const handleProductSelect = (idx: number, name: string) => {
    const newLines = [...lines];
    newLines[idx].productName = name;
    const catalogItem = productCatalog.find(p => p.name.toLowerCase() === name.toLowerCase());
    if (catalogItem?.defaultPrice !== null && catalogItem?.defaultPrice !== undefined && catalogItem.defaultPrice > 0 && !newLines[idx].unitPrice) {
      newLines[idx].unitPrice = catalogItem.defaultPrice;
      newLines[idx].lineTotal = newLines[idx].quantity * catalogItem.defaultPrice * (1 - newLines[idx].discountPercent / 100);
    }
    setLines(newLines);
  };

  const resolvePrice = async (idx: number) => {
    const line = lines[idx];
    if (!line.productName) return;
    const newLines = [...lines];
    newLines[idx].resolving = true;
    setLines(newLines);
    try {
      const res = await authFetch(`${API}/quote-builder/resolve-price`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          productName: line.productName,
          customerId: form.customerId,
          quantity: line.quantity
        })
      });
      const data = await res.json();
      if (data.resolvedPrice !== null) {
        const updated = [...lines];
        updated[idx].unitPrice = data.resolvedPrice;
        updated[idx].appliedRule = data.appliedRule;
        updated[idx].resolving = false;
        const l = updated[idx];
        l.lineTotal = l.quantity * l.unitPrice * (1 - l.discountPercent / 100);
        setLines(updated);
      } else {
        const updated = [...lines];
        updated[idx].resolving = false;
        updated[idx].appliedRule = "לא נמצא מחיר";
        setLines(updated);
      }
    } catch {
      const updated = [...lines];
      updated[idx].resolving = false;
      setLines(updated);
    }
  };

  const addLine = () => setLines([...lines, {
    productName: "", description: "", quantity: 1,
    unitPrice: 0, discountPercent: 0, lineTotal: 0, sortOrder: lines.length
  }]);

  const removeLine = (idx: number) => setLines(lines.filter((_, i) => i !== idx));

  const onDragStart = (idx: number) => { dragIdx.current = idx; };
  const onDragEnter = (idx: number) => { dragOverIdx.current = idx; };
  const onDragEnd = () => {
    if (dragIdx.current === null || dragOverIdx.current === null) return;
    const newLines = [...lines];
    const [dragged] = newLines.splice(dragIdx.current, 1);
    newLines.splice(dragOverIdx.current, 0, dragged);
    setLines(newLines.map((l, i) => ({ ...l, sortOrder: i })));
    dragIdx.current = null;
    dragOverIdx.current = null;
  };

  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  const maxDiscount = Math.max(...lines.map(l => l.discountPercent), 0);
  const needsApproval = maxDiscount > discountThreshold;

  const save = async () => {
    if (!validateQuoteForm()) {
      return;
    }
    setSaving(true);
    try {
      const url = editing ? `${API}/sales/quotations/${editing.id}` : `${API}/sales/quotations`;
      const method = editing ? "PUT" : "POST";

      // For new quote creation, capture agent GPS to enable location verification
      let agentLatitude: number | undefined;
      let agentLongitude: number | undefined;
      if (!editing && navigator.geolocation) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000, maximumAge: 60000 })
          );
          agentLatitude = pos.coords.latitude;
          agentLongitude = pos.coords.longitude;
        } catch {
          // GPS unavailable — proceed without location verification
        }
      }

      const payload = agentLatitude !== undefined
        ? { ...form, lines, agentLatitude, agentLongitude }
        : { ...form, lines };

      const res = await authFetch(url, { method, headers: getHeaders(), body: JSON.stringify(payload) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.error || "שגיאה בשמירה"); return; }
      const saved = await res.json();

      if (saved.approvalRequired) {
        alert(`ההנחה (${maxDiscount}%) חורגת מהסף (${discountThreshold}%). נשלחה בקשת אישור למנהל.`);
      }

      setShowForm(false);
      load();
    } finally { setSaving(false); }
  };

  const convertToOrder = (id: number) => {
    const minDate = new Date().toISOString().slice(0, 10);
    setDeliveryModal({ quoteId: id, date: minDate });
  };

  const doConvert = async () => {
    const { quoteId, date } = deliveryModal;
    if (!quoteId) return;
    if (!(await globalConfirm("להמיר הצעה להזמנת מכירה?"))) return;
    const res = await authFetch(`${API}/sales/quotations/${quoteId}/convert`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ deliveryDate: date || undefined })
    });
    const data = await res.json().catch(() => ({}));
    setDeliveryModal({ quoteId: null, date: "" });
    if (!res.ok) {
      if (data.creditBlocked) {
        alert(`⚠️ חריגת אשראי — ההמרה נחסמה.\n${data.error}`);
      } else if (data.approvalRequired) {
        alert(`⚠️ ממתינה לאישור הנחה — לא ניתן להמיר.\n${data.error}`);
      } else if (data.approvalRejected) {
        alert(`⚠️ ההנחה נדחתה על ידי מנהל — יש להפחית את ההנחה ולשמור מחדש.\n${data.error}`);
      } else {
        alert(data.error || "שגיאה בהמרה");
      }
      return;
    }
    if (data.reservationWarnings && data.reservationWarnings.length > 0) {
      alert(`הזמנה נוצרה בהצלחה.\n\nאזהרות מלאי:\n${data.reservationWarnings.join("\n")}`);
    }
    load();
  };

  const remove = async (id: number) => {
    if (!(await globalConfirm("למחוק הצעה?"))) return;
    await authFetch(`${API}/sales/quotations/${id}`, { method: "DELETE", headers: getHeaders() });
    load();
  };

  const openPdf = (id: number) => {
    window.open(`/api/quote-builder/pdf/${id}`, "_blank");
  };

  const handleApproval = async (approvalId: number, action: "approve" | "reject") => {
    const reason = action === "reject" ? prompt("סיבת הדחייה:") : undefined;
    await authFetch(`${API}/quote-builder/discount-approvals/${approvalId}/${action}`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ approvedBy: "מנהל", rejectedBy: "מנהל", reason })
    });
    load();
  };

  const exportCSV = () => {
    const csv = ["מספר,לקוח,תאריך,תוקף,סטטוס,סכום", ...filtered.map(r => `${r.quote_number},${r.customer_name || ""},${r.quote_date || ""},${r.valid_until || ""},${STATUS_MAP[r.status]?.label || r.status},${r.total || 0}`)].join("\n");
    const b = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "quotations.csv"; a.click();
  };

  const pendingApprovals = approvals.filter(a => a.status === "pending");

  const kpis = [
    { label: "סה\"כ הצעות", value: fmt(stats.total || 0), icon: FileText, color: "text-blue-400" },
    { label: "ממתינות", value: fmt(stats.sent || 0), icon: Clock, color: "text-amber-400" },
    { label: "התקבלו", value: fmt(stats.accepted || 0), icon: CheckCircle, color: "text-green-400" },
    { label: "שיעור המרה", value: `${stats.conversion_rate || 0}%`, icon: TrendingUp, color: "text-purple-400" },
    { label: "ערך כולל", value: fmtC(stats.total_value || 0), icon: DollarSign, color: "text-cyan-400" },
    { label: "ממתין לאישור", value: fmt(pendingApprovals.length), icon: AlertTriangle, color: "text-orange-400" },
  ];

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold">הצעות מחיר</h1>
          <p className="text-sm text-muted-foreground">מנוע בניית הצעות מחיר עם תמחור אוטומטי ואישור הנחות</p>
        </div>
        <div className="flex gap-2">
          {pendingApprovals.length > 0 && (
            <button onClick={() => setShowApprovals(!showApprovals)} className="btn btn-warning btn-sm flex items-center gap-1 relative">
              <AlertTriangle className="w-4 h-4" />
              אישור הנחות
              <span className="absolute -top-1 -right-1 bg-red-500 text-foreground text-xs rounded-full w-4 h-4 flex items-center justify-center">{pendingApprovals.length}</span>
            </button>
          )}
          <ImportButton apiRoute="/api/sales/quotations" onSuccess={load} />
          <button onClick={exportCSV} className="btn btn-outline btn-sm flex items-center gap-1"><Download className="w-4 h-4" />ייצוא</button>
          <button onClick={openCreate} className="btn btn-primary btn-sm flex items-center gap-1"><Plus className="w-4 h-4" />הצעה חדשה</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((k, i) => (
          <div key={i} className="bg-card border rounded-lg p-3 text-center">
            <k.icon className={`w-5 h-5 mx-auto mb-1 ${k.color}`} />
            <div className="text-lg font-bold">{k.value}</div>
            <div className="text-xs text-muted-foreground">{k.label}</div>
          </div>
        ))}
      </div>

      {showApprovals && pendingApprovals.length > 0 && (
        <div className="border border-orange-500/30 rounded-xl bg-orange-500/5 p-4">
          <h3 className="font-bold text-orange-400 mb-3 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> בקשות אישור הנחה ({pendingApprovals.length})</h3>
          <div className="space-y-2">
            {pendingApprovals.map(a => (
              <div key={a.id} className="flex items-center justify-between bg-card border rounded-lg p-3">
                <div>
                  <span className="font-medium">{a.quote_number}</span> — {a.customer_name}
                  <span className="text-orange-400 font-bold mx-2">{a.discount_percent}% הנחה</span>
                  <span className="text-xs text-muted-foreground">(סף: {a.threshold_percent}%)</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleApproval(a.id, "approve")} className="btn btn-success btn-xs">אשר</button>
                  <button onClick={() => handleApproval(a.id, "reject")} className="btn btn-error btn-xs">דחה</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-0 sm:min-w-[200px]">
          <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
          <input className="input input-bordered w-full pr-9 h-9 text-sm" placeholder="חיפוש..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="select select-bordered select-sm" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">כל הסטטוסים</option>
          {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {loading && <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>}
      {!loading && (
        <div className="border rounded-lg overflow-auto">
          <table className="table table-sm w-full">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-right">מספר</th>
                <th className="text-right">לקוח</th>
                <th className="text-right">תאריך</th>
                <th className="text-right">תוקף</th>
                <th className="text-right">סטטוס</th>
                <th className="text-right">סכום</th>
                <th className="text-right">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} className="hover:bg-muted/30">
                  <td className="font-mono text-xs">{r.quote_number}</td>
                  <td className="font-medium">{r.customer_name}</td>
                  <td>{r.quote_date?.slice(0, 10)}</td>
                  <td>{r.valid_until?.slice(0, 10) || "-"}</td>
                  <td>
                    <span className={`px-2 py-0.5 rounded text-xs ${STATUS_MAP[r.status]?.color || ""}`}>
                      {STATUS_MAP[r.status]?.label || r.status}
                    </span>
                  </td>
                  <td>{fmtC(r.total || 0)}</td>
                  <td>
                    <div className="flex gap-1">
                      {(r.status === "sent" || r.status === "draft" || r.status === "approved") && (
                        <button onClick={() => convertToOrder(r.id)} className="btn btn-ghost btn-xs text-green-400" title="המר להזמנה">
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button onClick={() => openPdf(r.id)} className="btn btn-ghost btn-xs text-blue-400" title="הורד PDF">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => openEdit(r)} className="btn btn-ghost btn-xs"><Edit className="w-3.5 h-3.5" /></button>
                      <button onClick={async () => { const _dup = await duplicateRecord(`${API}/sales/quotations`, r.id); if (_dup.ok) { load(); } else { alert("שגיאה בשכפול: " + _dup.error); } }} className="btn btn-ghost btn-xs" title="שכפול"><Copy className="w-3.5 h-3.5" /></button>
                      <button onClick={() => remove(r.id)} className="btn btn-ghost btn-xs text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">אין הצעות מחיר להצגה</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowForm(false)}>
          <div className="bg-card border rounded-xl p-6 w-full max-w-5xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">{editing ? "עריכת הצעה" : "הצעה חדשה"}</h2>
              <button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded"><XIcon className="w-5 h-5" /></button>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="text-sm font-medium">לקוח *</label>
                <input
                  className="input input-bordered w-full input-sm"
                  list="customer-list"
                  value={form.customerName || ""}
                  onChange={e => {
                    const val = e.target.value;
                    const cust = customers.find(c => c.name === val);
                    setForm({ ...form, customerName: val, customerId: cust?.id || form.customerId });
                  }}
                />
                <datalist id="customer-list">
                  {customers.map(c => <option key={c.id} value={c.name} />)}
                </datalist>
              </div>
              <div>
                <label className="text-sm font-medium">סטטוס</label>
                <select className="select select-bordered w-full select-sm" value={form.status || "draft"} onChange={e => setForm({ ...form, status: e.target.value })}>
                  {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">תאריך</label>
                <input type="date" dir="ltr" className="input input-bordered w-full input-sm" value={form.quoteDate || ""} onChange={e => setForm({ ...form, quoteDate: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">תוקף עד</label>
                <input type="date" dir="ltr" className="input input-bordered w-full input-sm" value={form.validUntil || ""} onChange={e => setForm({ ...form, validUntil: e.target.value })} />
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium">הערות</label>
                <textarea className="textarea textarea-bordered w-full text-sm" rows={2} value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>

            <div className="flex justify-between items-center mb-2">
              <h3 className="font-bold">פריטים</h3>
              {needsApproval && (
                <span className="text-xs text-orange-400 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  הנחה מעל {discountThreshold}% — דרוש אישור מנהל
                </span>
              )}
            </div>

            <div className="border rounded-lg overflow-auto mb-3">
              <table className="table table-sm w-full">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="w-6"></th>
                    <th className="text-right">מוצר/שירות</th>
                    <th className="text-right">תיאור</th>
                    <th className="text-right w-20">כמות</th>
                    <th className="text-right w-24">מחיר יח׳</th>
                    <th className="text-right w-20">הנחה %</th>
                    <th className="text-right w-24">סה״כ</th>
                    <th className="w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, idx) => (
                    <tr
                      key={idx}
                      draggable
                      onDragStart={() => onDragStart(idx)}
                      onDragEnter={() => onDragEnter(idx)}
                      onDragEnd={onDragEnd}
                      onDragOver={e => e.preventDefault()}
                      className={`hover:bg-muted/20 ${l.discountPercent > discountThreshold ? "bg-orange-500/5" : ""}`}
                    >
                      <td className="cursor-grab text-muted-foreground"><GripVertical className="w-4 h-4" /></td>
                      <td>
                        <div className="flex flex-col gap-0.5">
                          <input
                            className="input input-bordered input-sm w-full"
                            list={`products-${idx}`}
                            value={l.productName}
                            onChange={e => {
                              const val = e.target.value;
                              handleProductSelect(idx, val);
                            }}
                            onBlur={() => l.productName && resolvePrice(idx)}
                            placeholder="שם מוצר"
                          />
                          <datalist id={`products-${idx}`}>
                            {productCatalog.map(p => (
                              <option key={p.name} value={p.name}>
                                {p.code ? `${p.name} (${p.code})` : p.name}
                              </option>
                            ))}
                          </datalist>
                          {l.appliedRule && (
                            <span className="text-xs text-blue-400 flex items-center gap-1">
                              <Tag className="w-3 h-3" />{l.appliedRule}
                            </span>
                          )}
                        </div>
                      </td>
                      <td><input className="input input-bordered input-sm w-full" value={l.description} onChange={e => updateLine(idx, "description", e.target.value)} placeholder="תיאור" /></td>
                      <td>
                        <input type="number" dir="ltr" className="input input-bordered input-sm w-full" value={l.quantity}
                          onChange={e => { updateLine(idx, "quantity", Number(e.target.value)); }}
                          onBlur={() => resolvePrice(idx)}
                        />
                      </td>
                      <td>
                        <div className="relative">
                          <input type="number" dir="ltr" className="input input-bordered input-sm w-full" value={l.unitPrice} onChange={e => updateLine(idx, "unitPrice", Number(e.target.value))} />
                          {l.resolving && <Loader2 className="absolute left-2 top-2 w-3 h-3 animate-spin text-blue-400" />}
                        </div>
                      </td>
                      <td>
                        <input
                          type="number"
                          dir="ltr"
                          className={`input input-bordered input-sm w-full ${l.discountPercent > discountThreshold ? "border-orange-500 bg-orange-500/10" : ""}`}
                          value={l.discountPercent}
                          onChange={e => updateLine(idx, "discountPercent", Number(e.target.value))}
                        />
                      </td>
                      <td className="font-medium">{fmtC(l.lineTotal)}</td>
                      <td>
                        <div className="flex gap-1">
                          <button onClick={() => resolvePrice(idx)} className="btn btn-ghost btn-xs text-blue-400" title="מצא מחיר">
                            <RefreshCw className="w-3 h-3" />
                          </button>
                          <button onClick={() => removeLine(idx)} className="btn btn-ghost btn-xs text-red-400">
                            <XIcon className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button onClick={addLine} className="btn btn-outline btn-sm mb-3">
              <Plus className="w-3.5 h-3.5 mr-1" />הוסף שורה
            </button>

            <div className="bg-card border border-border/30 rounded-lg p-4 mt-3 space-y-2">
              {(() => {
                const vat = subtotal * VAT_RATE;
                const total = subtotal + vat;
                return (
                  <>
                    <div className="flex justify-between text-sm text-muted-foreground"><span>סה״כ לפני מע״מ</span><span className="font-mono">{fmtC(subtotal)}</span></div>
                    <div className="flex justify-between text-sm text-amber-400"><span>מע״מ (17%)</span><span className="font-mono">{fmtC(vat)}</span></div>
                    <div className="border-t border-border/30 pt-2 flex justify-between text-lg font-bold text-foreground"><span>סה״כ כולל מע״מ</span><span className="font-mono">{fmtC(total)}</span></div>
                  </>
                );
              })()}
            </div>

            {needsApproval && (
              <div className="mt-3 border border-orange-500/30 rounded-lg p-3 bg-orange-500/5 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-orange-400 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-orange-400">
                  <strong>דרוש אישור מנהל:</strong> הצעה זו מכילה הנחה של {maxDiscount}% שחורגת מהסף המורשה ({discountThreshold}%).
                  בלחיצה על שמירה, תישלח בקשת אישור למנהל והצעה תוסיף לרשימת הממתינים.
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowForm(false)} disabled={saving} className="btn btn-ghost btn-sm">ביטול</button>
              <button onClick={save} disabled={saving} className="btn btn-primary btn-sm flex items-center gap-1">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {saving ? "שומר..." : needsApproval ? "שמור ושלח לאישור" : "שמירה"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <ActivityLog entityType="quotations" entityId="all" />
        <RelatedRecords entityType="quotations" entityId="all" />
      </div>

      {deliveryModal.quoteId !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" dir="rtl">
          <div className="bg-base-100 rounded-xl shadow-xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-bold mb-4">המרה להזמנת מכירה</h3>
            <label className="label"><span className="label-text font-medium">תאריך אספקה מתוכנן</span></label>
            <input
              type="date"
              dir="ltr"
              className="input input-bordered w-full"
              value={deliveryModal.date}
              min={new Date().toISOString().slice(0, 10)}
              onChange={e => setDeliveryModal(m => ({ ...m, date: e.target.value }))}
            />
            <p className="text-sm text-base-content/60 mt-2">ניתן להשאיר ריק אם תאריך האספקה אינו ידוע</p>
            <div className="flex justify-end gap-2 mt-5">
              <button className="btn btn-ghost btn-sm" onClick={() => setDeliveryModal({ quoteId: null, date: "" })}>ביטול</button>
              <button className="btn btn-primary btn-sm" onClick={doConvert}>המר להזמנה</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
