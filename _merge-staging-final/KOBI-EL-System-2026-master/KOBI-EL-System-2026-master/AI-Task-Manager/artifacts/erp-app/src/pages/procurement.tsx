import { useState } from "react";
import { authFetch } from "@/lib/utils";
import { translateStatus } from "@/lib/status-labels";
import { ErrorState } from "@/components/ui/unified-states";
import { useTimedFetch } from "@/hooks/use-timed-fetch";
import { toast } from "@/hooks/use-toast";
import { Loader2, Save, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";

const INPUT_CLS = "w-full rounded-lg border border-gray-600 bg-gray-700/50 px-3 py-2 text-gray-200 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-colors";
const fmt = (v: number | string) => v ? new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS" }).format(Number(v) / 100) : "—";
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString("he-IL") : "—";

export default function PurchaseOrdersPage() {
  const { data: rawItems, loading, error, retry } = useTimedFetch<any[]>("/api/purchase-orders");
  const items: any[] = Array.isArray(rawItems) ? rawItems : [];

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<any>({});
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const validation = useFormValidation({
    order_number: { required: true, message: "מספר הזמנה חובה" },
    supplier_id: { required: true, message: "ספק חובה" },
    order_date: { required: true, message: "תאריך הזמנה חובה" },
  });

  const openNew = () => {
    setForm({ status: "pending", order_date: new Date().toISOString().slice(0, 10) });
    setEditId(null);
    validation.clearErrors();
    setShowForm(true);
  };

  const save = async () => {
    if (!validation.validate(form)) return;
    setSaving(true);
    try {
      const method = editId ? "PUT" : "POST";
      const url = editId ? "/api/purchase-orders/" + editId : "/api/purchase-orders";
      const res = await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "שגיאה בשמירה");
      }
      toast({ title: editId ? "הזמנה עודכנה בהצלחה" : "הזמנה נוצרה בהצלחה" });
      setForm({}); setEditId(null); setShowForm(false); validation.clearErrors(); retry();
    } catch (e: any) {
      toast({ title: "שגיאה", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const remove = async (id: number) => {
    if (!confirm("האם למחוק הזמנה זו?")) return;
    await authFetch("/api/purchase-orders/" + id, { method: "DELETE" });
    retry();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return <ErrorState description={error.message} onRetry={retry} />;
  }

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">הזמנות רכש</h1>
        <Button onClick={openNew} className="gap-1">
          <Plus className="w-4 h-4" />הזמנה חדשה
        </Button>
      </div>

      {showForm && (
        <div className="rounded-xl border border-border/50 bg-muted/30 p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">{editId ? "עריכת הזמנה" : "הזמנת רכש חדשה"}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">מספר הזמנה <RequiredMark /></label>
              <input
                type="text"
                className={`${INPUT_CLS} ${validation.getFieldProps("order_number").className}`}
                placeholder="PO-2024-001"
                value={form.order_number || ""}
                onChange={e => setForm({...form, order_number: e.target.value})}
              />
              <FormFieldError error={validation.errors.order_number} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">מזהה ספק <RequiredMark /></label>
              <input
                type="number"
                className={`${INPUT_CLS} ${validation.getFieldProps("supplier_id").className}`}
                placeholder="מזהה ספק"
                value={form.supplier_id || ""}
                onChange={e => setForm({...form, supplier_id: e.target.value})}
              />
              <FormFieldError error={validation.errors.supplier_id} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">תאריך הזמנה <RequiredMark /></label>
              <input
                type="date"
                className={`${INPUT_CLS} ${validation.getFieldProps("order_date").className}`}
                value={form.order_date || ""}
                onChange={e => setForm({...form, order_date: e.target.value})}
              />
              <FormFieldError error={validation.errors.order_date} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">תאריך אספקה צפוי</label>
              <input
                type="date"
                className={INPUT_CLS}
                value={form.expected_delivery || ""}
                onChange={e => setForm({...form, expected_delivery: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">סטטוס</label>
              <select
                className={INPUT_CLS}
                value={form.status || "pending"}
                onChange={e => setForm({...form, status: e.target.value})}
              >
                <option value="pending">ממתין</option>
                <option value="approved">מאושר</option>
                <option value="ordered">הוזמן</option>
                <option value="received">התקבל</option>
                <option value="cancelled">בוטל</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">סכום כולל (אגורות)</label>
              <input
                type="number"
                className={INPUT_CLS}
                placeholder="0"
                value={form.total_amount_cents || ""}
                onChange={e => setForm({...form, total_amount_cents: e.target.value})}
              />
            </div>
            <div className="md:col-span-2 lg:col-span-3">
              <label className="block text-sm font-medium text-gray-300 mb-1">הערות</label>
              <textarea
                className={`${INPUT_CLS} resize-none`}
                rows={2}
                placeholder="הערות להזמנה..."
                value={form.notes || ""}
                onChange={e => setForm({...form, notes: e.target.value})}
              />
            </div>
          </div>
          <div className="mt-4 flex gap-2 justify-end">
            <Button variant="outline" onClick={() => { setShowForm(false); setForm({}); setEditId(null); validation.clearErrors(); }}>ביטול</Button>
            <Button onClick={save} disabled={saving} className="gap-1">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {editId ? "עדכן" : "שמור"}
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border/50 bg-muted/30 overflow-hidden">
        <table className="w-full">
          <thead className="bg-muted/60 border-b border-border/50">
            <tr>
              <th className="px-4 py-3 text-right text-sm font-medium text-gray-300">#</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-gray-300">מספר הזמנה</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-gray-300">ספק</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-gray-300">תאריך הזמנה</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-gray-300">אספקה צפויה</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-gray-300">סטטוס</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-gray-300">סכום</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-gray-300">הערות</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-gray-300">פעולות</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700/30">
            {items.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400 text-sm">אין הזמנות רכש</td></tr>
            ) : items.map(item => (
              <tr key={item.id} className="hover:bg-gray-700/20">
                <td className="px-4 py-3 text-sm text-gray-400">{item.id}</td>
                <td className="px-4 py-3 text-sm text-gray-300 font-medium">{item.order_number}</td>
                <td className="px-4 py-3 text-sm text-gray-300">{item.supplier_id}</td>
                <td className="px-4 py-3 text-sm text-gray-300">{fmtDate(item.order_date)}</td>
                <td className="px-4 py-3 text-sm text-gray-300">{fmtDate(item.expected_delivery)}</td>
                <td className="px-4 py-3 text-sm text-gray-300">{translateStatus(item.status)}</td>
                <td className="px-4 py-3 text-sm text-gray-300">{fmt(item.total_amount_cents)}</td>
                <td className="px-4 py-3 text-sm text-gray-400 max-w-[150px] truncate">{item.notes || "—"}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    <button onClick={() => { setForm(item); setEditId(item.id); validation.clearErrors(); setShowForm(true); }} className="px-2 py-1 text-xs bg-yellow-600/20 text-yellow-400 rounded hover:bg-yellow-600/30 transition-colors">עריכה</button>
                    <button onClick={() => remove(item.id)} className="px-2 py-1 text-xs bg-red-600/20 text-red-400 rounded hover:bg-red-600/30 transition-colors">מחיקה</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
