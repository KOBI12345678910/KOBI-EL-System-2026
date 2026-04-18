import { useState, useEffect } from "react";
import { authFetch } from "../../lib/utils";

export default function StockMovementsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<any>({});
  const [editId, setEditId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    const res = await authFetch("/api/stock-movements");
    if (res.ok) setItems(await res.json());
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    const method = editId ? "PUT" : "POST";
    const url = editId ? "/api/stock-movements/" + editId : "/api/stock-movements";
    await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setForm({}); setEditId(null); setShowForm(false); load();
  };

  const remove = async (id: number) => {
    await authFetch("/api/stock-movements/" + id, { method: "DELETE" });
    load();
  };

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-100">תנועות מלאי</h1>
        <button onClick={() => { setShowForm(!showForm); setForm({}); setEditId(null); }} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm">
          {showForm ? "סגור" : "+ חדש"}
        </button>
      </div>

      {showForm && (
        <div className="rounded-xl border border-gray-700/50 bg-gray-800/30 p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">product_id</label>
                <input
                  type="number"
                  className="w-full rounded-lg border border-gray-600 bg-gray-700/50 px-3 py-2 text-gray-200"
                  placeholder="product_id"
                  value={form.product_id || ""}
                  onChange={e => setForm({...form, product_id: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">warehouse_id</label>
                <input
                  type="number"
                  className="w-full rounded-lg border border-gray-600 bg-gray-700/50 px-3 py-2 text-gray-200"
                  placeholder="warehouse_id"
                  value={form.warehouse_id || ""}
                  onChange={e => setForm({...form, warehouse_id: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">movement_type</label>
                <input
                  type="text"
                  className="w-full rounded-lg border border-gray-600 bg-gray-700/50 px-3 py-2 text-gray-200"
                  placeholder="movement_type"
                  value={form.movement_type || ""}
                  onChange={e => setForm({...form, movement_type: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">quantity</label>
                <input
                  type="number"
                  className="w-full rounded-lg border border-gray-600 bg-gray-700/50 px-3 py-2 text-gray-200"
                  placeholder="quantity"
                  value={form.quantity || ""}
                  onChange={e => setForm({...form, quantity: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">unit_price_cents</label>
                <input
                  type="number"
                  className="w-full rounded-lg border border-gray-600 bg-gray-700/50 px-3 py-2 text-gray-200"
                  placeholder="unit_price_cents"
                  value={form.unit_price_cents || ""}
                  onChange={e => setForm({...form, unit_price_cents: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">reference_number</label>
                <input
                  type="text"
                  className="w-full rounded-lg border border-gray-600 bg-gray-700/50 px-3 py-2 text-gray-200"
                  placeholder="reference_number"
                  value={form.reference_number || ""}
                  onChange={e => setForm({...form, reference_number: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">notes</label>
                <input
                  type="text"
                  className="w-full rounded-lg border border-gray-600 bg-gray-700/50 px-3 py-2 text-gray-200"
                  placeholder="notes"
                  value={form.notes || ""}
                  onChange={e => setForm({...form, notes: e.target.value})}
                />
              </div>
          </div>
          <div className="mt-4 flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg text-sm">ביטול</button>
            <button onClick={save} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm">{editId ? "עדכן" : "שמור"}</button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-gray-700/50 bg-gray-800/30 overflow-hidden">
        {loading ? <div className="p-8 text-center text-gray-400">טוען...</div> : (
          <table className="w-full">
            <thead className="bg-gray-800/60 border-b border-gray-700/50">
              <tr>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-300">#</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-300">product_id</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-300">warehouse_id</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-300">movement_type</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-300">quantity</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-300">unit_price_cents</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-300">reference_number</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-300">notes</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-300">פעולות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/30">
              {items.map(item => (
                <tr key={item.id} className="hover:bg-gray-700/20">
                  <td className="px-4 py-3 text-sm text-gray-400">{item.id}</td>
                <td className="px-4 py-3 text-sm text-gray-300">{item.product_id}</td>
                <td className="px-4 py-3 text-sm text-gray-300">{item.warehouse_id}</td>
                <td className="px-4 py-3 text-sm text-gray-300">{item.movement_type}</td>
                <td className="px-4 py-3 text-sm text-gray-300">{item.quantity}</td>
                <td className="px-4 py-3 text-sm text-gray-300">{item.unit_price_cents}</td>
                <td className="px-4 py-3 text-sm text-gray-300">{item.reference_number}</td>
                <td className="px-4 py-3 text-sm text-gray-300">{item.notes}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => { setForm(item); setEditId(item.id); setShowForm(true); }} className="px-2 py-1 text-xs bg-yellow-600/20 text-yellow-400 rounded">עריכה</button>
                      <button onClick={() => remove(item.id)} className="px-2 py-1 text-xs bg-red-600/20 text-red-400 rounded">מחיקה</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
