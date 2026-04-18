import { useState, useEffect } from "react";
import { authFetch } from "../../lib/utils";

export default function PurchaseRequestsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<any>({});
  const [editId, setEditId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    const res = await authFetch("/api/purchase-requests");
    if (res.ok) setItems(await res.json());
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    const method = editId ? "PUT" : "POST";
    const url = editId ? "/api/purchase-requests/" + editId : "/api/purchase-requests";
    await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setForm({}); setEditId(null); setShowForm(false); load();
  };

  const remove = async (id: number) => {
    await authFetch("/api/purchase-requests/" + id, { method: "DELETE" });
    load();
  };

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-100">בקשות רכש</h1>
        <button onClick={() => { setShowForm(!showForm); setForm({}); setEditId(null); }} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm">
          {showForm ? "סגור" : "+ חדש"}
        </button>
      </div>

      {showForm && (
        <div className="rounded-xl border border-gray-700/50 bg-gray-800/30 p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">request_number</label>
                <input
                  type="text"
                  className="w-full rounded-lg border border-gray-600 bg-gray-700/50 px-3 py-2 text-gray-200"
                  placeholder="request_number"
                  value={form.request_number || ""}
                  onChange={e => setForm({...form, request_number: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">requester_id</label>
                <input
                  type="number"
                  className="w-full rounded-lg border border-gray-600 bg-gray-700/50 px-3 py-2 text-gray-200"
                  placeholder="requester_id"
                  value={form.requester_id || ""}
                  onChange={e => setForm({...form, requester_id: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">department</label>
                <input
                  type="text"
                  className="w-full rounded-lg border border-gray-600 bg-gray-700/50 px-3 py-2 text-gray-200"
                  placeholder="department"
                  value={form.department || ""}
                  onChange={e => setForm({...form, department: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">request_date</label>
                <input
                  type="text"
                  className="w-full rounded-lg border border-gray-600 bg-gray-700/50 px-3 py-2 text-gray-200"
                  placeholder="request_date"
                  value={form.request_date || ""}
                  onChange={e => setForm({...form, request_date: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">needed_by</label>
                <input
                  type="text"
                  className="w-full rounded-lg border border-gray-600 bg-gray-700/50 px-3 py-2 text-gray-200"
                  placeholder="needed_by"
                  value={form.needed_by || ""}
                  onChange={e => setForm({...form, needed_by: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">status</label>
                <input
                  type="text"
                  className="w-full rounded-lg border border-gray-600 bg-gray-700/50 px-3 py-2 text-gray-200"
                  placeholder="status"
                  value={form.status || ""}
                  onChange={e => setForm({...form, status: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">priority</label>
                <input
                  type="text"
                  className="w-full rounded-lg border border-gray-600 bg-gray-700/50 px-3 py-2 text-gray-200"
                  placeholder="priority"
                  value={form.priority || ""}
                  onChange={e => setForm({...form, priority: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">justification</label>
                <input
                  type="text"
                  className="w-full rounded-lg border border-gray-600 bg-gray-700/50 px-3 py-2 text-gray-200"
                  placeholder="justification"
                  value={form.justification || ""}
                  onChange={e => setForm({...form, justification: e.target.value})}
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
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-300">request_number</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-300">requester_id</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-300">department</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-300">request_date</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-300">needed_by</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-300">status</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-300">priority</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-300">justification</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-300">פעולות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/30">
              {items.map(item => (
                <tr key={item.id} className="hover:bg-gray-700/20">
                  <td className="px-4 py-3 text-sm text-gray-400">{item.id}</td>
                <td className="px-4 py-3 text-sm text-gray-300">{item.request_number}</td>
                <td className="px-4 py-3 text-sm text-gray-300">{item.requester_id}</td>
                <td className="px-4 py-3 text-sm text-gray-300">{item.department}</td>
                <td className="px-4 py-3 text-sm text-gray-300">{item.request_date}</td>
                <td className="px-4 py-3 text-sm text-gray-300">{item.needed_by}</td>
                <td className="px-4 py-3 text-sm text-gray-300">{item.status}</td>
                <td className="px-4 py-3 text-sm text-gray-300">{item.priority}</td>
                <td className="px-4 py-3 text-sm text-gray-300">{item.justification}</td>
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
