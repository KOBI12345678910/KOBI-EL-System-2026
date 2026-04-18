import { useState, useEffect } from "react";
import { authFetch } from "../../lib/utils";

export default function RawMaterialsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<any>({});
  const [editId, setEditId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    const res = await authFetch("/api/raw-materials");
    if (res.ok) setItems(await res.json());
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    const method = editId ? "PUT" : "POST";
    const url = editId ? "/api/raw-materials/" + editId : "/api/raw-materials";
    await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setForm({}); setEditId(null); setShowForm(false); load();
  };

  const remove = async (id: number) => {
    await authFetch("/api/raw-materials/" + id, { method: "DELETE" });
    load();
  };

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-100">חומרי גלם</h1>
        <button onClick={() => { setShowForm(!showForm); setForm({}); setEditId(null); }} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm">
          {showForm ? "סגור" : "+ חדש"}
        </button>
      </div>

      {showForm && (
        <div className="rounded-xl border border-gray-700/50 bg-gray-800/30 p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">name</label>
                <input
                  type="text"
                  className="w-full rounded-lg border border-gray-600 bg-gray-700/50 px-3 py-2 text-gray-200"
                  placeholder="name"
                  value={form.name || ""}
                  onChange={e => setForm({...form, name: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">material_code</label>
                <input
                  type="text"
                  className="w-full rounded-lg border border-gray-600 bg-gray-700/50 px-3 py-2 text-gray-200"
                  placeholder="material_code"
                  value={form.material_code || ""}
                  onChange={e => setForm({...form, material_code: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">unit</label>
                <input
                  type="text"
                  className="w-full rounded-lg border border-gray-600 bg-gray-700/50 px-3 py-2 text-gray-200"
                  placeholder="unit"
                  value={form.unit || ""}
                  onChange={e => setForm({...form, unit: e.target.value})}
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
                <label className="block text-sm font-medium text-gray-300 mb-1">stock_quantity</label>
                <input
                  type="number"
                  className="w-full rounded-lg border border-gray-600 bg-gray-700/50 px-3 py-2 text-gray-200"
                  placeholder="stock_quantity"
                  value={form.stock_quantity || ""}
                  onChange={e => setForm({...form, stock_quantity: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">min_stock_level</label>
                <input
                  type="number"
                  className="w-full rounded-lg border border-gray-600 bg-gray-700/50 px-3 py-2 text-gray-200"
                  placeholder="min_stock_level"
                  value={form.min_stock_level || ""}
                  onChange={e => setForm({...form, min_stock_level: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">supplier_id</label>
                <input
                  type="number"
                  className="w-full rounded-lg border border-gray-600 bg-gray-700/50 px-3 py-2 text-gray-200"
                  placeholder="supplier_id"
                  value={form.supplier_id || ""}
                  onChange={e => setForm({...form, supplier_id: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">specifications</label>
                <input
                  type="text"
                  className="w-full rounded-lg border border-gray-600 bg-gray-700/50 px-3 py-2 text-gray-200"
                  placeholder="specifications"
                  value={form.specifications || ""}
                  onChange={e => setForm({...form, specifications: e.target.value})}
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
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-300">name</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-300">material_code</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-300">unit</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-300">unit_price_cents</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-300">stock_quantity</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-300">min_stock_level</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-300">supplier_id</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-300">specifications</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-300">פעולות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/30">
              {items.map(item => (
                <tr key={item.id} className="hover:bg-gray-700/20">
                  <td className="px-4 py-3 text-sm text-gray-400">{item.id}</td>
                <td className="px-4 py-3 text-sm text-gray-300">{item.name}</td>
                <td className="px-4 py-3 text-sm text-gray-300">{item.material_code}</td>
                <td className="px-4 py-3 text-sm text-gray-300">{item.unit}</td>
                <td className="px-4 py-3 text-sm text-gray-300">{item.unit_price_cents}</td>
                <td className="px-4 py-3 text-sm text-gray-300">{item.stock_quantity}</td>
                <td className="px-4 py-3 text-sm text-gray-300">{item.min_stock_level}</td>
                <td className="px-4 py-3 text-sm text-gray-300">{item.supplier_id}</td>
                <td className="px-4 py-3 text-sm text-gray-300">{item.specifications}</td>
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
