import { useState, useEffect } from "react";
import { authFetch } from "../../lib/utils";

export default function SuppliersPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<any>({});
  const [editId, setEditId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    const res = await authFetch("/api/suppliers");
    if (res.ok) setItems(await res.json());
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    const method = editId ? "PUT" : "POST";
    const url = editId ? "/api/suppliers/" + editId : "/api/suppliers";
    await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setForm({}); setEditId(null); setShowForm(false); load();
  };

  const remove = async (id: number) => {
    await authFetch("/api/suppliers/" + id, { method: "DELETE" });
    load();
  };

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-100">ספקים</h1>
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
                <label className="block text-sm font-medium text-gray-300 mb-1">supplier_number</label>
                <input
                  type="text"
                  className="w-full rounded-lg border border-gray-600 bg-gray-700/50 px-3 py-2 text-gray-200"
                  placeholder="supplier_number"
                  value={form.supplier_number || ""}
                  onChange={e => setForm({...form, supplier_number: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">contact_person</label>
                <input
                  type="text"
                  className="w-full rounded-lg border border-gray-600 bg-gray-700/50 px-3 py-2 text-gray-200"
                  placeholder="contact_person"
                  value={form.contact_person || ""}
                  onChange={e => setForm({...form, contact_person: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">phone</label>
                <input
                  type="text"
                  className="w-full rounded-lg border border-gray-600 bg-gray-700/50 px-3 py-2 text-gray-200"
                  placeholder="phone"
                  value={form.phone || ""}
                  onChange={e => setForm({...form, phone: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">email</label>
                <input
                  type="text"
                  className="w-full rounded-lg border border-gray-600 bg-gray-700/50 px-3 py-2 text-gray-200"
                  placeholder="email"
                  value={form.email || ""}
                  onChange={e => setForm({...form, email: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">address</label>
                <input
                  type="text"
                  className="w-full rounded-lg border border-gray-600 bg-gray-700/50 px-3 py-2 text-gray-200"
                  placeholder="address"
                  value={form.address || ""}
                  onChange={e => setForm({...form, address: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">payment_terms</label>
                <input
                  type="text"
                  className="w-full rounded-lg border border-gray-600 bg-gray-700/50 px-3 py-2 text-gray-200"
                  placeholder="payment_terms"
                  value={form.payment_terms || ""}
                  onChange={e => setForm({...form, payment_terms: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">is_active</label>
                <input
                  type="text"
                  className="w-full rounded-lg border border-gray-600 bg-gray-700/50 px-3 py-2 text-gray-200"
                  placeholder="is_active"
                  value={form.is_active || ""}
                  onChange={e => setForm({...form, is_active: e.target.value})}
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
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-300">supplier_number</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-300">contact_person</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-300">phone</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-300">email</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-300">address</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-300">payment_terms</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-300">is_active</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-300">פעולות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/30">
              {items.map(item => (
                <tr key={item.id} className="hover:bg-gray-700/20">
                  <td className="px-4 py-3 text-sm text-gray-400">{item.id}</td>
                <td className="px-4 py-3 text-sm text-gray-300">{item.name}</td>
                <td className="px-4 py-3 text-sm text-gray-300">{item.supplier_number}</td>
                <td className="px-4 py-3 text-sm text-gray-300">{item.contact_person}</td>
                <td className="px-4 py-3 text-sm text-gray-300">{item.phone}</td>
                <td className="px-4 py-3 text-sm text-gray-300">{item.email}</td>
                <td className="px-4 py-3 text-sm text-gray-300">{item.address}</td>
                <td className="px-4 py-3 text-sm text-gray-300">{item.payment_terms}</td>
                <td className="px-4 py-3 text-sm text-gray-300">{item.is_active}</td>
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
