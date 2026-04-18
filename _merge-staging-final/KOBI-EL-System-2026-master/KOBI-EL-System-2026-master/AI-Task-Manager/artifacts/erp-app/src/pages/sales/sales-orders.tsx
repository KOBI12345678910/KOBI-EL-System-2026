import { useState, useEffect, useMemo, useRef } from "react";
import { useSearch } from "wouter";
import {
  ShoppingCart, Search, Plus, Edit, Trash2, Download, TrendingUp, DollarSign,
  Package, CheckCircle, Truck, Clock, X as XIcon, Loader2, AlertTriangle,
  Shield, Lock, CalendarIcon, ClipboardList, FileText, Copy
} from "lucide-react";
import { EmptyState } from "@/components/ui/unified-states";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import { useApiAction, ActionButton } from "@/hooks/use-api-action";
import { authFetch } from "@/lib/utils";
import { VAT_RATE } from "@/utils/money";
import { duplicateRecord } from "@/lib/duplicate-record";
import ImportButton from "@/components/import-button";
import ActivityLog from "@/components/activity-log";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import RelatedRecords from "@/components/related-records";

const API = "/api";
const getHeaders = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("erp_token") || ""}` });
const fmt = (n: number) => new Intl.NumberFormat("he-IL").format(n);
const fmtC = (n: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(n);

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft: { label: "טיוטה", color: "bg-muted/20 text-muted-foreground" },
  confirmed: { label: "מאושר", color: "bg-blue-500/20 text-blue-400" },
  shipped: { label: "נשלח", color: "bg-amber-500/20 text-amber-400" },
  delivered: { label: "סופק", color: "bg-green-500/20 text-green-400" },
  cancelled: { label: "בוטל", color: "bg-red-500/20 text-red-400" },
};

type Line = { productName: string; description: string; quantity: number; unitPrice: number; discountPercent: number; lineTotal: number; sortOrder: number };

interface CreditCheckResult {
  approved: boolean;
  creditLimit: number;
  openTotal: number;
  available: number;
  orderAmount: number;
  customerName: string;
  reason: string;
}

export default function SalesOrders() {
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
  const [tableLoading, setTableLoading] = useState(true);
  const [customers, setCustomers] = useState<any[]>([]);
  const [creditCheck, setCreditCheck] = useState<CreditCheckResult | null>(null);
  const [checkingCredit, setCheckingCredit] = useState(false);
  const [reservationWarnings, setReservationWarnings] = useState<string[]>([]);
  const [showReservations, setShowReservations] = useState(false);
  const pagination = useSmartPagination(25);
  const { selectedIds, toggle, toggleAll, clear, isSelected } = useBulkSelection();
  const { executeSave, executeDelete, execute, loading } = useApiAction();
  const searchStr = useSearch();
  const deepLinkHandledId = useRef<string | null>(null);

  const load = () => {
    setTableLoading(true);
    Promise.all([
      authFetch(`${API}/sales/orders`, { headers: getHeaders() }).then(r => r.json()).then(d => setItems(Array.isArray(d) ? d : [])).catch(() => setItems([])),
      authFetch(`${API}/sales/orders/stats`, { headers: getHeaders() }).then(r => r.json()).then(d => setStats(d || {})).catch(() => {}),
      authFetch(`${API}/sales/customers`, { headers: getHeaders() }).then(r => r.json()).then(d => setCustomers(Array.isArray(d) ? d : [])).catch(() => {}),
    ]).finally(() => setTableLoading(false));
  };
  useEffect(load, []);

  useEffect(() => {
    if (!searchStr || items.length === 0) return;
    const params = new URLSearchParams(searchStr);
    const idParam = params.get("id");
    if (!idParam || deepLinkHandledId.current === idParam) return;
    const target = items.find(r => String(r.id) === idParam);
    if (target) {
      deepLinkHandledId.current = idParam;
      openEdit(target);
    }
  }, [items, searchStr]);

  const filtered = useMemo(() => {
    return items.filter(r => {
      const s = `${r.order_number} ${r.customer_name}`.toLowerCase();
      if (search && !s.includes(search.toLowerCase())) return false;
      if (filterStatus && r.status !== filterStatus) return false;
      return true;
    });
  }, [items, search, filterStatus]);

  const paginatedRows = pagination.paginate(filtered);

  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);

  const openCreate = () => {
    setEditing(null);
    setForm({ status: "draft", orderDate: new Date().toISOString().slice(0, 10) });
    setLines([{ productName: "", description: "", quantity: 1, unitPrice: 0, discountPercent: 0, lineTotal: 0, sortOrder: 0 }]);
    setCreditCheck(null);
    setReservationWarnings([]);
    setShowForm(true);
  };

  const openEdit = async (r: any) => {
    setEditing(r);
    setForm({
      customerId: r.customer_id,
      customerName: typeof r.customer_name === "string" ? r.customer_name : String(r.customer_name ?? ""),
      orderDate: typeof r.order_date === "string" ? r.order_date.slice(0, 10) : "",
      deliveryDate: typeof r.delivery_date === "string" ? r.delivery_date.slice(0, 10) : "",
      status: r.status,
      notes: typeof r.notes === "string" ? r.notes : (r.notes != null ? String(r.notes) : ""),
      discountAmount: r.discount_amount,
      paidAmount: r.paid_amount,
      paymentStatus: r.payment_status
    });
    try {
      const res = await authFetch(`${API}/sales/orders/${r.id}`, { headers: getHeaders() });
      const data = await res.json();
      setLines((data.lines || []).map((l: any) => ({
        productName: l.product_name,
        description: l.description || "",
        quantity: Number(l.quantity),
        unitPrice: Number(l.unit_price),
        discountPercent: Number(l.discount_percent),
        lineTotal: Number(l.line_total),
        sortOrder: l.sort_order
      })));
    } catch { setLines([]); }
    setCreditCheck(null);
    setReservationWarnings([]);
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

  const runCreditCheck = async () => {
    if (!form.customerId) { alert("יש לבחור לקוח לפני בדיקת אשראי"); return; }
    setCheckingCredit(true);
    try {
      const res = await authFetch(`${API}/quote-builder/credit-check`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ customerId: form.customerId, orderAmount: subtotal * (1 + VAT_RATE) })
      });
      const data = await res.json();
      setCreditCheck(data);
    } catch (e: any) {
      alert("שגיאה בבדיקת אשראי: " + e.message);
    } finally {
      setCheckingCredit(false);
    }
  };

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const save = async () => {
    const errors: Record<string, string> = {};
    if (!form.customerId && !form.customerName) errors.customerName = "שדה חובה — יש לבחור לקוח";
    if (!form.orderDate) errors.orderDate = "שדה חובה — יש להזין תאריך הזמנה";
    if (lines.length === 0 || lines.every(l => !l.productName)) errors.lines = "יש להוסיף לפחות פריט אחד להזמנה";
    if (Object.keys(errors).length > 0) { setFormErrors(errors); return; }
    setFormErrors({});

    if (creditCheck && !creditCheck.approved) {
      const proceed = await globalConfirm("לקוח חרג ממגבלת האשראי. להמשיך בכל זאת?");
      if (!proceed) return;
    }

    const url = editing ? `${API}/sales/orders/${editing.id}` : `${API}/sales/orders`;
    const method = editing ? "PUT" : "POST";
    const ok = await executeSave(
      () => fetch(url, { method, headers: getHeaders(), body: JSON.stringify({ ...form, lines }) }),
      !!editing,
      {
        successMessage: editing ? "הזמנה עודכנה בהצלחה" : "הזמנה נוצרה בהצלחה",
        onSuccess: async (data: any) => {
          const orderId = editing ? editing.id : data?.id;
          if (!editing && orderId && lines.some(l => l.productName)) {
            try {
              const resRes = await authFetch(`${API}/quote-builder/reserve-inventory`, {
                method: "POST",
                headers: getHeaders(),
                body: JSON.stringify({ orderId, lines })
              });
              const resData = await resRes.json();
              if (resData.warnings && resData.warnings.length > 0) {
                setReservationWarnings(resData.warnings);
                setShowReservations(true);
              }
            } catch {}
          }
          setShowForm(false);
          load();
        }
      }
    );
  };

  const doAction = async (id: number, action: string) => {
    const labels: Record<string, string> = { confirm: "אושרה", ship: "נשלחה", deliver: "סופקה" };
    await execute(
      () => authFetch(`${API}/sales/orders/${id}/${action}`, { method: "POST", headers: getHeaders(), body: JSON.stringify({}) }),
      { successMessage: `הזמנה ${labels[action] || "עודכנה"} בהצלחה`, onSuccess: load }
    );
  };

  const remove = async (id: number) => {
    await executeDelete(
      () => authFetch(`${API}/sales/orders/${id}`, { method: "DELETE", headers: getHeaders() }),
      { confirm: "למחוק הזמנה?", successMessage: "הזמנה נמחקה בהצלחה", onSuccess: load }
    );
  };

  const [createdWOs, setCreatedWOs] = useState<Set<number>>(new Set());
  const [createdInvoices, setCreatedInvoices] = useState<Set<number>>(new Set());

  const createWorkOrder = async (order: any) => {
    if (createdWOs.has(order.id)) return;
    if (!(await globalConfirm(`ליצור הוראת עבודה מהזמנה ${order.order_number}?`))) return;
    await execute(
      () => authFetch(`${API}/work-orders`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          orderNumber: `WO-${order.order_number}`,
          productName: order.lines?.[0]?.productName || order.customer_name || "מהזמנה",
          quantityPlanned: order.lines?.reduce((s: number, l: any) => s + (l.quantity || 1), 0) || 1,
          plannedStart: order.order_date?.slice(0, 10) || new Date().toISOString().slice(0, 10),
          plannedEnd: order.delivery_date?.slice(0, 10) || "",
          status: "draft",
          customerId: order.customer_id,
          priority: "medium",
          workOrderType: "standard",
          title: `הוראת עבודה – ${order.order_number} – ${order.customer_name || ""}`,
          customerName: order.customer_name,
          sourceOrderId: order.id,
        })
      }),
      { successMessage: "הוראת עבודה נוצרה בהצלחה", onSuccess: () => { setCreatedWOs(prev => new Set(prev).add(order.id)); load(); } }
    );
  };

  const createInvoice = async (order: any) => {
    if (createdInvoices.has(order.id)) return;
    if (!(await globalConfirm(`ליצור חשבונית מהזמנה ${order.order_number}?`))) return;
    await execute(
      () => authFetch(`${API}/finance/invoices`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          invoiceNumber: `INV-${order.order_number}`,
          customerId: order.customer_id,
          customerName: order.customer_name,
          invoiceDate: new Date().toISOString().slice(0, 10),
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
          status: "draft",
          subtotal: order.total || 0,
          vatRate: 17,
          vatAmount: Math.round((order.total || 0) * VAT_RATE * 100) / 100,
          totalAmount: Math.round((order.total || 0) * (1 + VAT_RATE) * 100) / 100,
          sourceOrderId: order.id,
          notes: `מבוסס על הזמנה ${order.order_number}`,
        })
      }),
      { successMessage: "חשבונית נוצרה בהצלחה — בדוק בדף חשבוניות לקוח", onSuccess: () => { setCreatedInvoices(prev => new Set(prev).add(order.id)); load(); } }
    );
  };

  const exportCSV = () => {
    const csv = ["מספר,לקוח,תאריך,סטטוס,סכום", ...filtered.map(r => `${r.order_number},${r.customer_name || ""},${r.order_date || ""},${STATUS_MAP[r.status]?.label || r.status},${r.total || 0}`)].join("\n");
    const b = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "sales-orders.csv"; a.click();
  };

  const kpis = [
    { label: "סה\"כ הזמנות", value: fmt(stats.total || 0), icon: ShoppingCart, color: "text-blue-400" },
    { label: "הזמנות החודש", value: fmt(stats.this_month || 0), icon: Clock, color: "text-cyan-400" },
    { label: "ממתינים למשלוח", value: fmt(stats.pending_delivery || 0), icon: Truck, color: "text-amber-400" },
    { label: "הכנסות כוללות", value: fmtC(stats.total_revenue || 0), icon: DollarSign, color: "text-green-400" },
    { label: "הכנסות החודש", value: fmtC(stats.month_revenue || 0), icon: TrendingUp, color: "text-purple-400" },
    { label: "ממתין לתשלום", value: fmtC(stats.pending_payment || 0), icon: Package, color: "text-red-400" },
  ];

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold">הזמנות מכירה</h1>
          <p className="text-sm text-muted-foreground">ניהול הזמנות עם בדיקת אשראי, הזמנת מלאי ותזמון אספקה</p>
        </div>
        <div className="flex gap-2">
          <ImportButton apiRoute="/api/sales/orders" onSuccess={load} />
          <button onClick={exportCSV} className="btn btn-outline btn-sm flex items-center gap-1"><Download className="w-4 h-4" />ייצוא</button>
          <button onClick={openCreate} className="btn btn-primary btn-sm flex items-center gap-1"><Plus className="w-4 h-4" />הזמנה חדשה</button>
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

      {showReservations && reservationWarnings.length > 0 && (
        <div className="border border-amber-500/30 rounded-xl bg-amber-500/5 p-4">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-bold text-amber-400 flex items-center gap-2"><AlertTriangle className="w-4 h-4" />אזהרות הזמנת מלאי</h3>
            <button onClick={() => setShowReservations(false)} className="p-1 hover:bg-muted rounded"><XIcon className="w-4 h-4" /></button>
          </div>
          <ul className="text-sm text-amber-300 space-y-1">
            {reservationWarnings.map((w, i) => <li key={i}>• {w}</li>)}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-0 sm:min-w-[200px]">
          <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
          <input className="input input-bordered w-full pr-9 h-9 text-sm" placeholder="חיפוש לפי מספר הזמנה, לקוח..." value={search} onChange={e => { setSearch(e.target.value); pagination.setPage(1); }} />
        </div>
        <select className="select select-bordered select-sm" value={filterStatus} onChange={e => { setFilterStatus(e.target.value); pagination.setPage(1); }}>
          <option value="">כל הסטטוסים</option>
          {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      <div className="border rounded-lg overflow-auto relative">
        {tableLoading && (
          <div className="absolute inset-0 bg-background/60 backdrop-blur-[1px] flex items-center justify-center z-10">
            <div className="flex items-center gap-2 bg-background border rounded-lg px-4 py-2 shadow-lg">
              <Loader2 className="w-4 h-4 animate-spin text-primary" /><span className="text-sm">טוען נתונים...</span>
            </div>
          </div>
        )}
        <table className="table table-sm w-full">
          <thead>
            <tr className="bg-muted/50">
              <th className="text-right">מספר</th>
              <th className="text-right">לקוח</th>
              <th className="text-right">תאריך</th>
              <th className="text-right">אספקה</th>
              <th className="text-right">סטטוס</th>
              <th className="text-right">סכום</th>
              <th className="text-right">תשלום</th>
              <th className="text-right">פעולות</th>
            </tr>
          </thead>
          <tbody>
            {paginatedRows.map(r => (
              <tr key={r.id} className="hover:bg-muted/30">
                <td className="font-mono text-xs">{typeof r.order_number === "object" ? JSON.stringify(r.order_number) : String(r.order_number ?? "")}</td>
                <td className="font-medium">{typeof r.customer_name === "object" ? JSON.stringify(r.customer_name) : String(r.customer_name ?? "")}</td>
                <td>{typeof r.order_date === "string" ? r.order_date.slice(0, 10) : ""}</td>
                <td>{typeof r.delivery_date === "string" ? r.delivery_date.slice(0, 10) : "-"}</td>
                <td><span className={`px-2 py-0.5 rounded text-xs ${STATUS_MAP[r.status]?.color || ""}`}>{STATUS_MAP[r.status]?.label || String(r.status ?? "")}</span></td>
                <td>{fmtC(r.total || 0)}</td>
                <td><span className={`text-xs ${r.payment_status === "paid" ? "text-green-400" : "text-amber-400"}`}>{r.payment_status === "paid" ? "שולם" : "לא שולם"}</span></td>
                <td>
                  <div className="flex gap-1 flex-wrap">
                    {r.status === "draft" && <button onClick={() => doAction(r.id, "confirm")} className="btn btn-ghost btn-xs text-blue-400" title="אשר הזמנה"><CheckCircle className="w-3.5 h-3.5" /></button>}
                    {r.status === "confirmed" && <button onClick={() => doAction(r.id, "ship")} className="btn btn-ghost btn-xs text-amber-400" title="סמן כנשלח"><Truck className="w-3.5 h-3.5" /></button>}
                    {r.status === "shipped" && <button onClick={() => doAction(r.id, "deliver")} className="btn btn-ghost btn-xs text-green-400" title="סמן כסופק"><Package className="w-3.5 h-3.5" /></button>}
                    {(r.status === "confirmed" || r.status === "shipped" || r.status === "delivered") && (
                      <button onClick={() => createWorkOrder(r)} disabled={createdWOs.has(r.id)} className={`btn btn-ghost btn-xs ${createdWOs.has(r.id) ? "text-muted-foreground opacity-50" : "text-purple-400"}`} title={createdWOs.has(r.id) ? "הוראת עבודה כבר נוצרה" : "צור הוראת עבודה"}><ClipboardList className="w-3.5 h-3.5" /></button>
                    )}
                    {(r.status === "confirmed" || r.status === "shipped" || r.status === "delivered") && r.payment_status !== "paid" && (
                      <button onClick={() => createInvoice(r)} disabled={createdInvoices.has(r.id)} className={`btn btn-ghost btn-xs ${createdInvoices.has(r.id) ? "text-muted-foreground opacity-50" : "text-cyan-400"}`} title={createdInvoices.has(r.id) ? "חשבונית כבר נוצרה" : "צור חשבונית"}><FileText className="w-3.5 h-3.5" /></button>
                    )}
                    <button onClick={() => openEdit(r)} className="btn btn-ghost btn-xs" title="ערוך"><Edit className="w-3.5 h-3.5" /></button>
                    <button onClick={async () => { const _dup = await duplicateRecord(`/api/sales/orders`, r.id); if (_dup.ok) { load(); } else { alert("שגיאה בשכפול: " + _dup.error); } }} className="btn btn-ghost btn-xs" title="שכפול"><Copy className="w-3.5 h-3.5" /></button>
                    {isSuperAdmin && <button onClick={async () => { if (await globalConfirm(`למחוק הזמנה? פעולה זו אינה ניתנת לביטול.`)) remove(r.id); }} className="btn btn-ghost btn-xs text-red-400" title="מחק"><Trash2 className="w-3.5 h-3.5" /></button>}
                  </div>
                </td>
              </tr>
            ))}
            {!tableLoading && paginatedRows.length === 0 && (
              <tr><td colSpan={8}>
                <EmptyState
                  icon={ShoppingCart}
                  title="עדיין אין הזמנות מכירה במערכת"
                  subtitle="צור את ההזמנה הראשונה שלך ותתחיל לנהל את מכירות העסק"
                  ctaLabel="➕ צור הזמנה ראשונה"
                  onCtaClick={openCreate}
                />
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <SmartPagination pagination={pagination} />

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowForm(false)}>
          <div className="bg-card border rounded-xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">{editing ? "עריכת הזמנה" : "הזמנה חדשה"}</h2>
              <button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded"><XIcon className="w-5 h-5" /></button>
            </div>

            {Object.keys(formErrors).length > 0 && (
              <div className="mb-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400 space-y-1">
                {Object.values(formErrors).map((e, i) => <div key={i}>⚠ {e}</div>)}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="text-sm font-medium">לקוח *</label>
                <input
                  className={`input input-bordered w-full input-sm ${formErrors.customerName ? "border-red-500" : ""}`}
                  list="order-customer-list"
                  value={form.customerName || ""}
                  onChange={e => {
                    const val = e.target.value;
                    const cust = customers.find(c => c.name === val);
                    setForm({ ...form, customerName: val, customerId: cust?.id || form.customerId });
                    setCreditCheck(null);
                    if (formErrors.customerName) setFormErrors(prev => { const n = { ...prev }; delete n.customerName; return n; });
                  }}
                />
                {formErrors.customerName && <p className="text-xs text-red-400 mt-0.5">{formErrors.customerName}</p>}
                <datalist id="order-customer-list">
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
                <label className="text-sm font-medium">תאריך הזמנה *</label>
                <input type="date" className={`input input-bordered w-full input-sm ${formErrors.orderDate ? "border-red-500" : ""}`} value={form.orderDate || ""} onChange={e => { setForm({ ...form, orderDate: e.target.value }); if (formErrors.orderDate) setFormErrors(prev => { const n = { ...prev }; delete n.orderDate; return n; }); }} />
                {formErrors.orderDate && <p className="text-xs text-red-400 mt-0.5">{formErrors.orderDate}</p>}
              </div>
              <div>
                <label className="text-sm font-medium flex items-center gap-1"><CalendarIcon className="w-3.5 h-3.5" /> תאריך אספקה מתוכנן</label>
                <input type="date" className="input input-bordered w-full input-sm" value={form.deliveryDate || ""} onChange={e => setForm({ ...form, deliveryDate: e.target.value })}
                  min={form.orderDate || new Date().toISOString().slice(0, 10)}
                />
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium">הערות</label>
                <textarea className="textarea textarea-bordered w-full text-sm" rows={2} value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>

            {/* Credit Check */}
            <div className="mb-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={runCreditCheck}
                  disabled={checkingCredit || !form.customerId}
                  className="btn btn-outline btn-sm flex items-center gap-1"
                >
                  {checkingCredit ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Shield className="w-3.5 h-3.5" />}
                  בדיקת אשראי
                </button>
                {!form.customerId && <span className="text-xs text-muted-foreground">בחר לקוח לבדיקת אשראי</span>}
              </div>
              {creditCheck && (
                <div className={`mt-2 p-3 rounded-lg border text-sm ${creditCheck.approved ? "border-green-500/30 bg-green-500/5" : "border-red-500/30 bg-red-500/5"}`}>
                  <div className="flex items-center gap-2 mb-1">
                    {creditCheck.approved
                      ? <CheckCircle className="w-4 h-4 text-green-400" />
                      : <Lock className="w-4 h-4 text-red-400" />
                    }
                    <span className={`font-bold ${creditCheck.approved ? "text-green-400" : "text-red-400"}`}>
                      {creditCheck.approved ? "אשראי מאושר" : "חריגת אשראי"}
                    </span>
                  </div>
                  <div className="text-muted-foreground">{creditCheck.reason}</div>
                  {creditCheck.creditLimit > 0 && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      מסגרת: {fmtC(creditCheck.creditLimit)} |
                      פתוח: {fmtC(creditCheck.openTotal)} |
                      זמין: {fmtC(creditCheck.available)}
                    </div>
                  )}
                </div>
              )}
            </div>

            <h3 className="font-bold mb-2">פריטים *</h3>
            {formErrors.lines && <p className="text-xs text-red-400 mb-2">⚠ {formErrors.lines}</p>}
            <div className="border rounded-lg overflow-auto mb-3">
              <table className="table table-sm w-full">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-right">מוצר/שירות</th>
                    <th className="text-right">תיאור</th>
                    <th className="text-right w-20">כמות</th>
                    <th className="text-right w-24">מחיר יח׳</th>
                    <th className="text-right w-20">הנחה %</th>
                    <th className="text-right w-24">סה״כ שורה</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
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
                </tbody>
              </table>
            </div>

            <button onClick={addLine} className="btn btn-outline btn-sm mb-3"><Plus className="w-3.5 h-3.5 mr-1" />הוסף שורה</button>

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

            {!editing && (
              <div className="mt-3 text-xs text-muted-foreground flex items-center gap-1">
                <Package className="w-3.5 h-3.5" />
                בעת שמירה, מערכת תנסה להזמין מלאי אוטומטית עבור הפריטים בהזמנה
              </div>
            )}

            {creditCheck && !creditCheck.approved && (
              <div className="mt-3 border border-red-500/30 rounded-lg p-3 bg-red-500/5 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-red-400">
                  <strong>אזהרת אשראי:</strong> {creditCheck.reason}. ניתן להמשיך אך תידרש אישור מנהל.
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowForm(false)} className="btn btn-ghost btn-sm">ביטול</button>
              <ActionButton onClick={save} loading={loading} variant="primary" size="sm">שמירה</ActionButton>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <ActivityLog entityType="sales-orders" entityId="all" />
        <RelatedRecords entityType="sales-orders" entityId="all" />
      </div>
    </div>
  );
}
