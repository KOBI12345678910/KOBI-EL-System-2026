import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';

const paymentTermOptions = [
  { value: 'immediate', label: 'מיידי' },
  { value: 'shotef_plus_0', label: 'שוטף' },
  { value: 'shotef_plus_30', label: 'שוטף + 30' },
  { value: 'shotef_plus_60', label: 'שוטף + 60' },
  { value: 'shotef_plus_90', label: 'שוטף + 90' },
  { value: 'custom', label: 'מותאם אישית' },
];

export default function Suppliers() {
  const navigate = useNavigate();
  const [suppliers, setSuppliers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    name: '', contact_name: '', email: '', phone: '',
    category_id: '', payment_terms: 'shotef_plus_30',
    custom_terms_days: '', expected_invoice_day: '', notes: '',
  });

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const [s, c] = await Promise.all([api.get('/suppliers'), api.get('/categories')]);
    setSuppliers(s.data);
    setCategories(c.data);
  }

  function startEdit(supplier) {
    setForm({
      name: supplier.name,
      contact_name: supplier.contact_name || '',
      email: supplier.email || '',
      phone: supplier.phone || '',
      category_id: supplier.category_id || '',
      payment_terms: supplier.payment_terms || 'shotef_plus_30',
      custom_terms_days: supplier.custom_terms_days || '',
      expected_invoice_day: supplier.expected_invoice_day || '',
      notes: supplier.notes || '',
    });
    setEditingId(supplier.id);
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const data = { ...form };
    if (data.category_id === '') data.category_id = null;
    if (data.custom_terms_days === '') data.custom_terms_days = null;
    if (data.expected_invoice_day === '') data.expected_invoice_day = null;

    if (editingId) {
      await api.patch(`/suppliers/${editingId}`, data);
    } else {
      await api.post('/suppliers', data);
    }

    setShowForm(false);
    setEditingId(null);
    setForm({ name: '', contact_name: '', email: '', phone: '', category_id: '', payment_terms: 'shotef_plus_30', custom_terms_days: '', expected_invoice_day: '', notes: '' });
    loadData();
  }

  async function sendReminder(supplierId, method) {
    try {
      await api.post(`/reminders/send/${supplierId}`, { method });
      alert('תזכורת נשלחה');
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה');
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">ספקים</h1>
        <button onClick={() => { setShowForm(!showForm); setEditingId(null); }}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm">
          + ספק חדש
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
          <h3 className="font-semibold text-gray-800 mb-4">{editingId ? 'עריכת ספק' : 'ספק חדש'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input type="text" required placeholder="שם ספק *" value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <input type="text" placeholder="איש קשר" value={form.contact_name}
              onChange={e => setForm({ ...form, contact_name: e.target.value })}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <input type="email" placeholder="אימייל" value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <input type="tel" placeholder="טלפון" value={form.phone}
              onChange={e => setForm({ ...form, phone: e.target.value })}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <select value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="">ללא קטגוריה</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select value={form.payment_terms} onChange={e => setForm({ ...form, payment_terms: e.target.value })}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
              {paymentTermOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {form.payment_terms === 'custom' && (
              <input type="number" placeholder="מספר ימים מותאם" value={form.custom_terms_days}
                onChange={e => setForm({ ...form, custom_terms_days: e.target.value })}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            )}
            <input type="number" min="1" max="31" placeholder="יום צפוי לחשבונית (1-31)" value={form.expected_invoice_day}
              onChange={e => setForm({ ...form, expected_invoice_day: e.target.value })}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <input type="text" placeholder="הערות" value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <button type="submit" className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm">
              {editingId ? 'עדכן ספק' : 'הוסף ספק'}
            </button>
          </div>
        </form>
      )}

      {/* Supplier cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {suppliers.map(s => (
          <div key={s.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow cursor-pointer"
            onClick={() => navigate(`/suppliers/${s.id}`)}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-bold text-gray-800 text-lg">{s.name}</h3>
                {s.contact_name && <p className="text-sm text-gray-500">{s.contact_name}</p>}
              </div>
              {s.category_name && (
                <span className="text-xs px-2 py-1 rounded-full text-white" style={{ backgroundColor: s.category_color }}>
                  {s.category_name}
                </span>
              )}
            </div>

            <div className="space-y-1 text-sm text-gray-600 mb-3">
              {s.email && <p>📧 {s.email}</p>}
              {s.phone && <p>📱 {s.phone}</p>}
              <p>💳 {paymentTermOptions.find(o => o.value === s.payment_terms)?.label || s.payment_terms}</p>
              {s.expected_invoice_day && <p>📅 חשבונית ב-{s.expected_invoice_day} בחודש</p>}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-gray-100">
              <div className="text-sm">
                <span className="text-gray-500">{s.invoice_count} חשבוניות</span>
                {s.total_debt > 0 && <span className="text-red-600 font-semibold mr-3">₪{s.total_debt.toLocaleString()}</span>}
              </div>
              <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                {s.email && (
                  <button onClick={() => sendReminder(s.id, 'email')} className="text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100" title="שלח תזכורת">
                    📧
                  </button>
                )}
                <button onClick={(e) => { e.stopPropagation(); startEdit(s); }} className="text-xs px-2 py-1 bg-gray-50 text-gray-600 rounded hover:bg-gray-100">
                  ערוך
                </button>
              </div>
            </div>
          </div>
        ))}
        {suppliers.length === 0 && (
          <div className="col-span-3 text-center py-12 text-gray-400">
            אין ספקים. לחץ על "ספק חדש" כדי להוסיף.
          </div>
        )}
      </div>
    </div>
  );
}
